import { Play, WifiOff } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router'
import { AudioEngine } from '../audio/engine'
import { BrandMark } from '../components/Brand'
import type { EditorChart } from '../editor/chartModel'
import { wallNow, type ClockSync } from '../game/clock'
import { buildTimeline, lineIndexAt, type Part, type Timeline } from '../game/timeline'
import { useClockSync } from '../game/useClockSync'
import { useSongAssets } from '../game/useSongAssets'
import { playerColor } from '../lib/colors'
import { formatScore } from '../lib/format'
import { formatCode, normalizeCode } from '../lib/roomCode'
import NoteLane from '../room/NoteLane'
import type { LobbyRoom, ServerMessage } from '../room/protocol'
import { ReactionLayer } from '../room/Reactions'
import { useRoomSocket } from '../room/useRoomSocket'
import FullscreenButton from '../stage/FullscreenButton'
import StageLobby from '../stage/StageLobby'
import { Avatar } from '../ui/Avatar'
import { SongCover } from '../ui/SongCover'
import { cx } from '../ui/cx'
import { useListenVoice } from '../voice/liveVoice'

/**
 * The stage screen: a TV or laptop in the party room. It plays the music and shows
 * the game big (note lanes, lyrics, scores, reactions). It isn't a player: the
 * host opens it with the room's stage link.
 */
export default function StagePage() {
  const { t } = useTranslation()
  const { code: rawCode = '' } = useParams()
  const [params] = useSearchParams()
  const code = normalizeCode(rawCode) ?? ''
  const token = params.get('t') ?? ''
  const { state, send, subscribe } = useRoomSocket(code, `/ws/stage/${code}?t=${encodeURIComponent(token)}`)
  const { clock } = useClockSync(state.status === 'open', send, subscribe)
  const [engine, setEngine] = useState<AudioEngine | null>(null)
  useEffect(() => () => engine?.close(), [engine])
  const room = state.room
  const assets = useSongAssets(code, room?.song ?? null, engine, token)
  // The singer's live voice on the stage's speakers. Off by default: in the same room it
  // arrives a little late and the singer's mic can pick it up again.
  const [voiceOn, setVoiceOn] = useState(() => readVoicePref())
  const singingNow = room?.mode === 'spotlight' && (room.phase === 'countdown' || room.phase === 'playing')
  const voice = useListenVoice(code, voiceOn && singingNow && !!engine, token)

  if (state.status === 'ended') {
    return (
      <div className="stage-screen center">
        <div className="stage-bg" aria-hidden />
        <BrandMark size={72} />
        <p className="stage-message">{t(state.endReason === 'room_closed' ? 'stage.closed' : 'stage.badLink')}</p>
      </div>
    )
  }
  if (!room) {
    return (
      <div className="stage-screen center">
        <div className="stage-bg" aria-hidden />
        <BrandMark size={72} />
        <p className="stage-message" role="status">
          <span className="spinner" aria-hidden />
          {t('lobby.connecting')}
        </p>
      </div>
    )
  }

  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.name ?? '…'
  const singing = room.phase === 'countdown' || room.phase === 'playing'
  const onStage = singing && !!room.performance_id

  return (
    <div className={cx('stage-screen', onStage ? 'is-singing' : 'is-between')}>
      <div className="stage-bg" aria-hidden />
      {!engine && (
        <button type="button" className="stage-start" onClick={async () => setEngine(await AudioEngine.createPlayback())}>
          <span className="stage-start-icon" aria-hidden>
            <Play size={64} fill="currentColor" />
          </span>
          <strong>{t('stage.start')}</strong>
          <span className="stage-start-help">{t('stage.startHelp')}</span>
          <span className="stage-start-code">{formatCode(code)}</span>
        </button>
      )}
      {onStage ? (
        <StageSing room={room} clock={clock} engine={engine} chart={assets.chart} buffer={assets.buffer}
          subscribe={subscribe} nameOf={nameOf} />
      ) : (
        <StageLobby room={room} code={code} subscribe={subscribe} nameOf={nameOf} />
      )}
      <div className="stage-controls">
        {room.mode === 'spotlight' && engine && (
          <button type="button" className="stage-voice-switch" aria-pressed={voiceOn} onClick={() => {
            setVoiceOn(!voiceOn)
            writeVoicePref(!voiceOn)
          }}>
            {voiceOn ? t('voice.stageOn', { count: voice.voices }) : t('voice.stageOff')}
          </button>
        )}
        <FullscreenButton />
      </div>
      {state.status !== 'open' && (
        <p className="stage-banner" role="status">
          <WifiOff size={20} aria-hidden />
          {t('lobby.reconnecting')}
        </p>
      )}
    </div>
  )
}

/** During a song: the music, a note lane per part, big lyrics, the scoreboard and reactions. */
function StageSing({ room, clock, engine, chart, buffer, subscribe, nameOf }: {
  room: LobbyRoom
  clock: ClockSync
  engine: AudioEngine | null
  chart: EditorChart | undefined
  buffer: AudioBuffer | null
  subscribe: (listener: (message: ServerMessage) => void) => () => void
  nameOf: (id: string) => string
}) {
  const { t, i18n } = useTranslation()
  const startLocal = useMemo(() => clock.toLocal(room.start_at ?? 0), [clock, room.start_at])
  const songTime = useCallback(() => (wallNow() - startLocal) / 1000, [startLocal])
  const singers = Object.keys(room.parts)
  const parts = useMemo(() => [...new Set(Object.values(room.parts))].sort() as Part[], [room.parts])
  const timelines = useMemo(
    () => (chart ? parts.map((part) => ({ part, timeline: buildTimeline(chart, part) })) : []),
    [chart, parts],
  )
  const order = room.players.map((p) => p.id)

  // The music, for the whole room.
  useEffect(() => {
    if (!engine || !buffer || !room.performance_id) return
    return engine.playAt(buffer, startLocal)
  }, [engine, buffer, startLocal, room.performance_id])

  const countdown = useCountdown(songTime)

  const top = Math.max(0, ...singers.map((id) => room.scores[id] ?? 0))
  const colorOf = (id: string) => playerColor(Math.max(0, order.indexOf(id)))

  return (
    <div className="stage-sing">
      <header className="stage-top">
        <div className="stage-now">
          {room.song && <SongCover song={room.song} size={72} className="stage-now-cover" />}
          <div className="stage-now-text">
            <h1 className="stage-now-title">{room.song?.title}</h1>
            <p className="stage-now-sub">
              {room.mode === 'spotlight'
                ? t('spotlight.nowSinging', { names: singers.map(nameOf).join(' & ') })
                : room.song?.artist}
            </p>
          </div>
        </div>
        <ol className="stage-live-scores">
          {singers.map((id) => {
            const score = room.scores[id] ?? 0
            return (
              <li key={id} className={cx('stage-live', top > 0 && score === top && singers.length > 1 && 'leading')}
                style={{ '--row-color': colorOf(id) } as CSSProperties}>
                <Avatar name={nameOf(id)} color={colorOf(id)} size="lg" decorative />
                <span className="stage-live-text">
                  <span className="stage-live-name">{nameOf(id)}</span>
                  <b className="stage-live-score">{formatScore(score, i18n.language)}</b>
                </span>
              </li>
            )
          })}
        </ol>
      </header>

      <div className="stage-lanes">
        {timelines.map(({ part, timeline }) => (
          <div key={part} className="stage stage-lane">
            {timelines.length > 1 && (
              <span className="lane-label">
                {singers.filter((id) => room.parts[id] === part).map((id) => (
                  <span key={id} className="lane-label-singer">
                    <Avatar name={nameOf(id)} color={colorOf(id)} size="sm" decorative />
                    {nameOf(id)}
                  </span>
                ))}
              </span>
            )}
            <NoteLane timeline={timeline} songTime={songTime} scorer={null} trail={null} />
          </div>
        ))}
        <ReactionLayer subscribe={subscribe} nameOf={nameOf} />
        {countdown !== null && (
          <div className="countdown" aria-live="assertive">
            <span key={countdown <= 3 ? countdown : 'ready'} className={cx('countdown-value', countdown > 3 && 'ready')}>
              {countdown <= 3 ? countdown : t('game.sing.getReady')}
            </span>
          </div>
        )}
      </div>

      <div className={cx('stage-lyrics-wrap', timelines.length > 1 && 'duet')}>
        {timelines.map(({ part, timeline }) => (
          <StageLyrics key={part} timeline={timeline} songTime={songTime} />
        ))}
      </div>
    </div>
  )
}

function useCountdown(songTime: () => number): number | null {
  const [value, setValue] = useState<number | null>(null)
  useEffect(() => {
    let frame = 0
    const tick = () => {
      const now = songTime()
      const next = now < 0 ? Math.ceil(-now) : null
      setValue((v) => (v === next ? v : next))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [songTime])
  return value
}

/** The current lyric line (sung part highlighted) and the next one. */
function StageLyrics({ timeline, songTime }: { timeline: Timeline; songTime: () => number }) {
  const [view, setView] = useState({ line: 0, sung: 0 })
  useEffect(() => {
    let frame = 0
    const tick = () => {
      const now = songTime()
      const line = lineIndexAt(timeline, now)
      const sung = timeline.lines[line]?.notes.filter((n) => n.start <= now).length ?? 0
      setView((v) => (v.line === line && v.sung === sung ? v : { line, sung }))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [timeline, songTime])
  const current = timeline.lines[view.line]
  const next = timeline.lines[view.line + 1]
  return (
    <div className="lyrics stage-lyrics">
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
  )
}

const VOICE_KEY = 'kp_stage_voice'

function readVoicePref(): boolean {
  try {
    return localStorage.getItem(VOICE_KEY) === '1'
  } catch {
    return false
  }
}

function writeVoicePref(on: boolean) {
  try {
    localStorage.setItem(VOICE_KEY, on ? '1' : '0')
  } catch {
    // private mode: just for now
  }
}
