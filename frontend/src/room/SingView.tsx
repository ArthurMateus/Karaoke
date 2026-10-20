import { useCallback, useEffect, useMemo, useState } from 'react'
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

interface Props {
  room: LobbyRoom
  me: string
  engine: AudioEngine | null
  clock: ClockSync
  chart: EditorChart | undefined
  buffer: AudioBuffer | null
  latencyMs: number
  send: (message: ClientMessage) => void
  subscribe: (listener: (message: ServerMessage) => void) => () => void
  onUpload: (performanceId: string, upload: Promise<void>) => void
}

interface View {
  line: number
  sung: number // notes of the current line already reached
  countdown: number | null
  rating: { kind: Rating; key: number } | null
}

const TRAIL_SECONDS = 2

export default function SingView({ room, me, engine, clock, chart, buffer, latencyMs, send, subscribe, onUpload }: Props) {
  const { t } = useTranslation()
  const part = room.parts[me]
  const singing = !!part && !!engine
  const performanceId = room.performance_id
  const timeline = useMemo(() => (chart ? buildTimeline(chart, part ?? 'P1') : null), [chart, part])
  const startLocal = useMemo(() => clock.toLocal(room.start_at ?? 0), [clock, room.start_at])
  const songTime = useCallback(() => (wallNow() - startLocal) / 1000, [startLocal])

  // A fresh scorer and pitch trail for each performance.
  const scorer = useMemo(
    () => (singing && timeline && performanceId ? new Scorer(timeline) : null),
    [singing, timeline, performanceId],
  )
  const trail = useMemo<TrailPoint[] | null>(() => (scorer ? [] : null), [scorer])
  const [myTotal, setMyTotal] = useState(0)
  const [view, setView] = useState<View>({ line: 0, sung: 0, countdown: null, rating: null })

  // The backing track (everyone hears it, singers and watchers).
  useEffect(() => {
    if (!engine || !buffer || !performanceId) return
    return engine.playAt(buffer, startLocal)
  }, [engine, buffer, startLocal, performanceId])

  // Singing: analyse the mic, score, record, and report.
  useEffect(() => {
    if (!scorer || !trail || !engine || !timeline || !performanceId) return
    const score = scorer
    const points = trail
    let finished = false
    let reported = 0
    let lastFrameTime: number | null = null
    let recordStart: number | null = null
    engine.startRecording().then((at) => (recordStart = at)).catch(() => undefined)
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
        onUpload(
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
      if (!finished) void engine.stopRecording() // left early: nothing to upload
    }
  }, [scorer, trail, engine, timeline, performanceId, startLocal, latencyMs, songTime, send, clock, onUpload])

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
  const spotlight = room.mode === 'spotlight'
  const nameOf = useCallback((id: string) => room.players.find((p) => p.id === id)?.name ?? '…', [room.players])

  return (
    <div className="sing">
      <div className="sing-top">
        <div>
          <h1 className="sing-title">{room.song?.title}</h1>
          <p className="muted small">
            {part
              ? t('game.sing.youSing', { part: part === 'P1' ? 'P1' : 'P2' })
              : spotlight
                ? t('spotlight.nowSinging', { names: singers.map(nameOf).join(' & ') })
                : t('game.sing.watching')}
          </p>
        </div>
        <Scoreboard room={room} singers={singers} me={me} myTotal={singing ? myTotal : null} />
      </div>

      <div className="stage">
        {timeline && <NoteLane timeline={timeline} songTime={songTime} scorer={scorer} trail={trail} />}
        {spotlight && <ReactionLayer subscribe={subscribe} nameOf={nameOf} />}
        {view.countdown !== null && (
          <div className="countdown" aria-live="assertive">
            {view.countdown <= 3 ? view.countdown : t('game.sing.getReady')}
          </div>
        )}
        {view.rating && view.countdown === null && (
          <div key={view.rating.key} className={`rating ${view.rating.kind}`}>
            {t(`game.sing.ratings.${view.rating.kind}`)}
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
