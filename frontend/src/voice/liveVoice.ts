// Live voice (Spotlight), through LiveKit: the singer's phone sends its microphone,
// the stage screen and faraway listeners receive it.
//
// Timing: a voice arrives a little late (the singer's mic, the network, a small
// buffer). A listener in another place hears music from their own phone, so they
// delay their music by about that much to line it up with the voice
// (see useListenVoice's delayMs). In the same room nobody needs this: everyone
// hears the singer directly.

import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client'
import { useEffect, useState } from 'react'
import { api } from '../api/client'

interface VoiceAccess {
  url: string
  token: string
  can_publish: boolean
}

/** How late a voice usually arrives on a home network, until it is measured. */
export const DEFAULT_VOICE_DELAY_MS = 350
const SENDER_DELAY_MS = 120 // the singer's mic and encoder, roughly

function serverUrl(access: VoiceAccess): string {
  if (access.url) return access.url
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
}

async function join(code: string, stageToken?: string): Promise<{ room: Room; access: VoiceAccess }> {
  const query = stageToken ? `?stage=${encodeURIComponent(stageToken)}` : ''
  const access = await api<VoiceAccess>(`/api/rooms/${code}/voice${query}`, { method: 'POST' })
  const room = new Room({ adaptiveStream: false, dynacast: false })
  await room.connect(serverUrl(access), access.token, { autoSubscribe: true })
  return { room, access }
}

/** While `stream` is set, send its audio (the singer's mic, or the robot) to the room's listeners. */
export function usePublishVoice(code: string, stream: MediaStream | null) {
  // Which stream went live or failed; the status follows from the stream we have now.
  const [result, setResult] = useState<{ stream: MediaStream; ok: boolean } | null>(null)
  const status: 'off' | 'connecting' | 'live' | 'failed' = !stream
    ? 'off'
    : result?.stream !== stream
      ? 'connecting'
      : result.ok
        ? 'live'
        : 'failed'

  useEffect(() => {
    if (!stream) return
    const track = stream.getAudioTracks()[0]
    if (!track) return
    let room: Room | null = null
    let cancelled = false
    join(code)
      .then(async (joined) => {
        room = joined.room
        if (cancelled) return void room.disconnect()
        if (!joined.access.can_publish) throw new Error('not a singer')
        // The track is already raw (no echo cancelling): good for music, as LiveKit's music preset expects.
        await room.localParticipant.publishTrack(track, {
          source: Track.Source.Microphone,
          name: 'voice',
          dtx: false,
          red: true,
          audioPreset: { maxBitrate: 64_000 },
        })
        if (!cancelled) setResult({ stream, ok: true })
      })
      .catch(() => !cancelled && setResult({ stream, ok: false }))
    return () => {
      cancelled = true
      // Stop sending, but leave the track itself alone: the app still records and scores it.
      void room?.disconnect(false)
    }
  }, [code, stream])

  return status
}

/**
 * While `active`, play the singers' voices on this device. Returns how many voices
 * are coming in and how late they arrive (delayMs), to line the music up with them.
 */
export function useListenVoice(code: string, active: boolean, stageToken?: string) {
  const [voices, setVoices] = useState(0)
  const [delayMs, setDelayMs] = useState(DEFAULT_VOICE_DELAY_MS)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!active) return
    let room: Room | null = null
    let cancelled = false
    let measure: ReturnType<typeof setInterval> | undefined
    const elements = new Map<string, HTMLMediaElement>()
    const tracks = new Map<string, RemoteTrack>()

    const update = () => setVoices(elements.size)
    const keyOf = (track: RemoteTrack) => track.sid ?? track.mediaStreamTrack.id
    const onSubscribed = (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) return
      const element = track.attach()
      element.style.display = 'none'
      document.body.appendChild(element)
      elements.set(keyOf(track), element)
      tracks.set(keyOf(track), track)
      update()
    }
    const onUnsubscribed = (track: RemoteTrack) => {
      track.detach().forEach((el) => el.remove())
      elements.delete(keyOf(track))
      tracks.delete(keyOf(track))
      update()
    }

    join(code, stageToken)
      .then(({ room: joined }) => {
        room = joined
        if (cancelled) return void joined.disconnect()
        setFailed(false)
        joined.on(RoomEvent.TrackSubscribed, onSubscribed)
        joined.on(RoomEvent.TrackUnsubscribed, onUnsubscribed)
        joined.remoteParticipants.forEach((p) =>
          p.trackPublications.forEach((pub) => pub.track && onSubscribed(pub.track as RemoteTrack)),
        )
        // Measure how late the voice is: the receiver's buffer plus half a round trip, plus the sender.
        measure = setInterval(async () => {
          const track = tracks.values().next().value
          const report = await track?.getRTCStatsReport?.()
          if (!report) return
          const ms = voiceDelayFromStats(report)
          if (ms !== null) setDelayMs((old) => (Math.abs(old - ms) > 60 ? ms : old))
        }, 2000)
      })
      .catch(() => !cancelled && setFailed(true))

    return () => {
      cancelled = true
      clearInterval(measure)
      elements.forEach((el) => el.remove())
      setVoices(0)
      void room?.disconnect()
    }
  }, [code, active, stageToken])

  return { voices, delayMs, failed }
}

/** Milliseconds between a sound at the singer's mic and it playing here, from WebRTC stats. */
export function voiceDelayFromStats(report: RTCStatsReport): number | null {
  let buffer: number | null = null
  let rtt: number | null = null
  report.forEach((stat: Record<string, unknown>) => {
    if (stat.type === 'inbound-rtp' && stat.kind === 'audio') {
      const delay = Number(stat.jitterBufferDelay)
      const emitted = Number(stat.jitterBufferEmittedCount)
      if (emitted > 0) buffer = (delay / emitted) * 1000
    }
    if (stat.type === 'candidate-pair' && stat.nominated && typeof stat.currentRoundTripTime === 'number') {
      rtt = stat.currentRoundTripTime * 1000
    }
  })
  if (buffer === null) return null
  return Math.round(SENDER_DELAY_MS + buffer + (rtt ?? 20) / 2)
}
