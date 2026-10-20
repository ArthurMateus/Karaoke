import { Mic, Radio } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AudioEngine } from '../audio/engine'
import { hzToMidi } from '../audio/yin'
import type { EditorChart } from '../editor/chartModel'
import { wallNow, type ClockSync } from '../game/clock'
import { rate, Scorer, type Rating } from '../game/scoring'
import { buildTimeline, lineIndexAt } from '../game/timeline'
import { uploadTake } from '../game/uploadTake'
import NoteLane, { type TrailPoint } from './NoteLane'
import type { ClientMessage, LobbyRoom, ServerMessage } from './protocol'
import { ReactionBar, ReactionLayer } from './Reactions'
import Scoreboard from './Scoreboard'
import { CountdownRing, SongCover } from '../ui'
import { useListenVoice, usePublishVoice } from '../voice/liveVoice'

interface Props {
  room: LobbyRoom
  me: string
  engine: AudioEngine | null // the microphone (null until it is turned on)
  player: AudioEngine | null // plays the music: the mic's engine, or a sound-only one for listeners
  onNeedPlayer: () => void // start a sound-only engine (from a tap)
  clock: ClockSync
  chart: EditorChart | undefined
  buffer: AudioBuffer | null
  latencyMs: number
  send: (message: ClientMessage) => void
  subscribe: (listener: (message: ServerMessage) => void) => () => void
  onUpload: (performanceId: string, upload: Promise<void>) => void
  musicHere: boolean // play the backing track on this phone (off while a stage screen plays it)
  onMusicHere: (on: boolean) => void
  fromAfar: boolean // Spotlight audience elsewhere: hear the singer live, music delayed to match
  onFromAfar: (on: boolean) => void
}

interface View {
  line: number
  sung: number // notes of the current line already reached
  countdown: number | null
  rating: { kind: Rating; key: number } | null
}

const TRAIL_SECONDS = 2
const COUNT_FROM = 3 // the big 3-2-1

export default function SingView(props: Props) {
  const { room, me, engine, player, onNeedPlayer, clock, chart, buffer, latencyMs, send, subscribe, onUpload, musicHere, onMusicHere, fromAfar, onFromAfar } = props
  const { t } = useTranslation()
  const part = room.parts[me]
  const singing = !!part && !!engine
  const performanceId = room.performance_id
  const keepRecording = room.replays
  const spotlight = room.mode === 'spotlight'
  const timeline = useMemo(() => (chart ? buildTimeline(chart, part ?? 'P1') : null), [chart, part])
  const startLocal = useMemo(() => clock.toLocal(room.start_at ?? 0), [clock, room.start_at])

  // Spotlight live voice: the singer sends their mic; a listener elsewhere hears it,
  // with their own music (and lane) delayed to match how late the voice arrives.
  const listening = spotlight && !part && fromAfar
  const voiceStatus = usePublishVoice(room.code, spotlight && singing ? engine.voiceStream : null)
  const voice = useListenVoice(room.code, listening)
  const shownStart = startLocal + (listening ? voice.delayMs : 0)
  const songTime = useCallback(() => (wallNow() - shownStart) / 1000, [shownStart])

  // A fresh scorer and pitch trail for each performance.
  const scorer = useMemo(
    () => (singing && timeline && performanceId ? new Scorer(timeline) : null),
    [singing, timeline, performanceId],
  )
  const trail = useMemo<TrailPoint[] | null>(() => (scorer ? [] : null), [scorer])
  const [myTotal, setMyTotal] = useState(0)
  const [view, setView] = useState<View>({ line: 0, sung: 0, countdown: null, rating: null })

  // The lobby is usually scrolled down (song picker); start each song at the top.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [performanceId])

  // Lets the page drop costly effects (the header blur) while the lanes move.
  useEffect(() => {
    document.documentElement.classList.add('singing')
    return () => document.documentElement.classList.remove('singing')
  }, [])

  // The backing track (everyone hears it, singers and watchers), unless the stage screen plays it.
  useEffect(() => {
    if (!player || !buffer || !performanceId || !(musicHere || listening)) return
    return player.playAt(buffer, shownStart)
  }, [player, buffer, shownStart, performanceId, musicHere, listening])

  // Singing: analyse the mic, score, record, and report.
  useEffect(() => {
    if (!scorer || !trail || !engine || !timeline || !performanceId) return
    const score = scorer
    const points = trail
    let finished = false
    let reported = 0
    let lastFrameTime: number | null = null
    let recordStart: number | null = null
    // The host's plan has no group replays: don't record at all.
    if (keepRecording) engine.startRecording().then((at) => (recordStart = at)).catch(() => undefined)
    if (engine.simulated) engine.singFake(timeline, startLocal)

    const stopFrames = engine.onFrame((frame) => {
      // When the singer actually made this sound, in song time.
      const time = (frame.t - latencyMs - startLocal) / 1000
      const dt = lastFrameTime === null ? 0.011 : Math.max(0, time - lastFrameTime)
      lastFrameTime = time
      const midi = frame.hz > 0 ? hzToMidi(frame.hz) : null
      score.addFrame(time, midi, frame.clarity, frame.level, dt)
      points.push({ time, midi: midi !== null && frame.clarity >= 0.5 && frame.level >= 0.01 ? midi : null })
      while (points.length && points[0].time < time - TRAIL_SECONDS) points.shift()
    })

    const ticker = setInterval(() => {
      const now = songTime()
      // Report each line as it ends: live scoreboard + a rating flash.
      while (reported < timeline.lines.length && timeline.lines[reported].end + 0.15 < now) {
        const total = score.total(now)
        // Rate now: the state updater runs later, after `reported` has moved on.
        const rating = { kind: rate(score.lineFraction(reported)), key: reported }
        setMyTotal(total)
        setView((v) => ({ ...v, rating }))
        send({ type: 'score', total })
        reported++
      }
      if (!finished && now > timeline.end + 1.5) {
        finished = true
        const total = score.total()
        setMyTotal(total)
        send({ type: 'finished', total })
        if (keepRecording) onUpload(
          performanceId,
          engine.stopRecording().then(async (recording) => {
            if (!recording || recording.size === 0 || recordStart === null) return
            await uploadTake(performanceId, recording, clock.serverNow(recordStart), latencyMs)
          }),
        )
      }
    }, 100)

    return () => {
      stopFrames()
      clearInterval(ticker)
      if (!finished && keepRecording) void engine.stopRecording() // left early: nothing to upload
    }
  }, [scorer, trail, engine, timeline, performanceId, startLocal, latencyMs, songTime, send, clock, onUpload, keepRecording])

  // Lyrics and countdown, updated only when they change.
  useEffect(() => {
    if (!timeline) return
    let frame = 0
    const tick = () => {
      const now = songTime()
      const line = lineIndexAt(timeline, now)
      const sung = timeline.lines[line]?.notes.filter((n) => n.start <= now).length ?? 0
      const countdown = now < 0 ? Math.ceil(-now) : null
      setView((v) => (v.line === line && v.sung === sung && v.countdown === countdown ? v : { ...v, line, sung, countdown }))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [timeline, songTime])

  const current = timeline?.lines[view.line]
  const next = timeline?.lines[view.line + 1]
  const singers = Object.keys(room.parts)
  const nameOf = useCallback((id: string) => room.players.find((p) => p.id === id)?.name ?? '…', [room.players])

  const role = part
    ? t('game.sing.youSing', { part: part === 'P1' ? 'P1' : 'P2' })
    : spotlight
      ? t('spotlight.nowSinging', { names: singers.map(nameOf).join(' & ') })
      : t('game.sing.watching')
  const songLength = buffer?.duration ?? room.song?.duration_seconds ?? timeline?.end ?? 0

  return (
    <div className="sing">
      <header className="sing-top">
        <div className="sing-heading">
          {room.song && <SongCover song={room.song} size={44} className="sing-cover" />}
          <div className="sing-titles">
            <h1 className="sing-title">{room.song?.title}</h1>
            <p className="muted small sing-role">
              {part && <Mic size={14} aria-hidden />}
              {role}
            </p>
          </div>
        </div>
        <Scoreboard room={room} singers={singers} me={me} myTotal={singing ? myTotal : null} />
      </header>
      <SongProgress songTime={songTime} length={songLength} />
      <div className="row wrap sing-switches">
        {room.stage_connected && engine && !listening && (
          <button type="button" className="sing-switch music-switch" aria-pressed={musicHere} onClick={() => onMusicHere(!musicHere)}>
            {musicHere ? t('stage.musicHereOn') : t('stage.musicHereOff')}
          </button>
        )}
        {spotlight && !part && (
          <button type="button" className="sing-switch music-switch" aria-pressed={fromAfar} onClick={() => {
            if (!player) onNeedPlayer()
            onFromAfar(!fromAfar)
          }}>
            {fromAfar ? t('voice.afarOn', { count: voice.voices, delay: (voice.delayMs / 1000).toFixed(2) }) : t('voice.afarOff')}
          </button>
        )}
        {listening && voice.failed && <span className="error small">{t('voice.failed')}</span>}
        {spotlight && part && voiceStatus === 'live' && (
          <span className="small voice-live">
            <Radio size={14} aria-hidden />
            {t('voice.live')}
          </span>
        )}
      </div>

      <div className="stage">
        {timeline && <NoteLane timeline={timeline} songTime={songTime} scorer={scorer} trail={trail} />}
        {spotlight && <ReactionLayer subscribe={subscribe} nameOf={nameOf} />}
        {view.countdown !== null && (
          <div className="countdown" aria-live="assertive">
            {/* The ring is full while we wait, then drains over each of the last three seconds. */}
            <CountdownRing left={Math.min(COUNT_FROM, view.countdown - 1)} total={COUNT_FROM} size={150}>
              {view.countdown <= COUNT_FROM && (
                <span key={view.countdown} className="countdown-num">
                  {view.countdown}
                </span>
              )}
            </CountdownRing>
            <span className="countdown-ready">{t('game.sing.getReady')}</span>
          </div>
        )}
        {view.rating && view.countdown === null && (
          <div key={view.rating.key} className={`rating ${view.rating.kind}`} aria-hidden>
            <span>{t(`game.sing.ratings.${view.rating.kind}`)}</span>
          </div>
        )}
      </div>

      <div className="lyrics" aria-live="off">
        <p className="lyric-line">
          {current?.notes.map((note, i) =>
            note.text === '~' ? null : (
              <span key={i} className={i < view.sung ? 'sung' : undefined}>
                {note.text}
              </span>
            ),
          )}
        </p>
        <p className="lyric-next">{next?.text ?? ''}</p>
      </div>
      {spotlight && !part && <ReactionBar send={send} />}
    </div>
  )
}

/** A thin bar for how far into the song we are. Moved with a transform a few times a second, outside React. */
function SongProgress({ songTime, length }: { songTime: () => number; length: number }) {
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!(length > 0)) return
    const update = () => {
      const part = Math.max(0, Math.min(1, songTime() / length))
      if (bar.current) bar.current.style.transform = `scaleX(${part})`
    }
    update()
    const id = setInterval(update, 500)
    return () => clearInterval(id)
  }, [songTime, length])
  return (
    <div className="song-progress" aria-hidden>
      <div ref={bar} className="song-progress-bar" />
    </div>
  )
}
