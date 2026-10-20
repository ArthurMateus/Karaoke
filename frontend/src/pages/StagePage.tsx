import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router'
import { useRoomInfo } from '../api/hooks'
import { AudioEngine } from '../audio/engine'
import QrCode from '../components/QrCode'
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

  if (state.status === 'ended') {
    return (
      <div className="stage-screen center">
        <p className="stage-message">{t(state.endReason === 'room_closed' ? 'stage.closed' : 'stage.badLink')}</p>
      </div>
    )
  }
  if (!room) {
    return (
      <div className="stage-screen center">
        <p className="stage-message">{t('lobby.connecting')}</p>
      </div>
    )
  }

  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.name ?? '…'
  const singing = room.phase === 'countdown' || room.phase === 'playing'

  return (
    <div className="stage-screen">
      {!engine && (
        <button className="stage-start" onClick={async () => setEngine(await AudioEngine.createPlayback())}>
          <strong>{t('stage.start')}</strong>
          <span>{t('stage.startHelp')}</span>
        </button>
      )}
      {singing && room.performance_id ? (
        <StageSing room={room} clock={clock} engine={engine} chart={assets.chart} buffer={assets.buffer}
          subscribe={subscribe} nameOf={nameOf} />
      ) : (
        <StageLobby room={room} code={code} subscribe={subscribe} nameOf={nameOf} />
      )}
      {state.status !== 'open' && <p className="stage-banner">{t('lobby.reconnecting')}</p>}
    </div>
  )
}

/** Between songs: how to join, what's next, and the scores so far. */
function StageLobby({ room, code, subscribe, nameOf }: {
  room: LobbyRoom
  code: string
  subscribe: (listener: (message: ServerMessage) => void) => () => void
  nameOf: (id: string) => string
}) {
  const { t, i18n } = useTranslation()
  const info = useRoomInfo(code)
  const joinUrl = info.data?.join_url ?? `${location.origin}/join/${code}`
  const order = room.players.map((p) => p.id)
  const spotlight = room.mode === 'spotlight'
  const next = room.queue[0]

  // After a song: this turn's (Spotlight) or this song's (Sing Together) ranking.
  const results =
    room.phase === 'results'
      ? Object.keys(room.parts)
          .map((id) => ({ id, points: room.votes?.points[id] ?? room.scores[id] ?? 0 }))
          .sort((a, b) => b.points - a.points)
      : null
  const ranking = results ?? (spotlight ? room.standings.map((s) => ({ id: s.id, points: s.points })) : [])

  return (
    <div className="stage-lobby">
      <ReactionLayer subscribe={subscribe} nameOf={nameOf} />
      <section className="stage-join">
        <QrCode text={joinUrl} label={t('lobby.scanToJoin')} />
        <p className="eyebrow">{t('stage.join')}</p>
        <p className="room-code">{formatCode(code)}</p>
        <p className="muted">{t('stage.players', { count: room.players.length })}</p>
      </section>

      <section className="stage-info">
        {results ? (
          <>
            <p className="eyebrow">{spotlight ? t('spotlight.turnOver') : t('game.results.title')}</p>
            <h1>{room.song?.title}</h1>
            {spotlight && (
              <p className="stage-votes">
                {room.votes?.count
                  ? t('spotlight.votes', { count: room.votes.count, average: room.votes.average?.toLocaleString(i18n.language) })
                  : t('stage.voteNow')}
              </p>
            )}
          </>
        ) : spotlight ? (
          <>
            <p className="eyebrow">{t('stage.upNext')}</p>
            <h1>{next ? next.song.title : t('stage.queueEmpty')}</h1>
            {next && (
              <p className="stage-sub">
                {next.partner_id ? t('spotlight.duetBy', { a: nameOf(next.singer_id), b: nameOf(next.partner_id) }) : nameOf(next.singer_id)}
              </p>
            )}
            {room.queue.length > 1 && (
              <p className="muted">{t('stage.thenQueue', { titles: room.queue.slice(1, 4).map((e) => nameOf(e.singer_id)).join(', ') })}</p>
            )}
          </>
        ) : (
          <>
            <p className="eyebrow">{t('game.song.next')}</p>
            <h1>{room.song?.title ?? t('stage.noSong')}</h1>
            {room.song && <p className="stage-sub">{room.song.artist}</p>}
          </>
        )}

        {ranking.length > 0 && (
          <>
            {!results && <p className="eyebrow">{t('spotlight.standings')}</p>}
            <ol className="ranking stage-ranking">
              {ranking.slice(0, 6).map((row, i) => (
                <li key={row.id} className={`rank ${i === 0 ? 'first' : ''}`}>
                  <span className="rank-place">{i + 1}</span>
                  <span className="avatar" style={{ background: playerColor(order.indexOf(row.id)) }} aria-hidden>
                    {nameOf(row.id).slice(0, 1).toUpperCase()}
                  </span>
                  <span className="player-name">{nameOf(row.id)}</span>
                  <b className="rank-score">{t('game.results.points', { score: formatScore(row.points, i18n.language) })}</b>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
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

  return (
    <div className="stage-sing">
      <header className="stage-top">
        <div>
          <h1 className="sing-title">{room.song?.title}</h1>
          <p className="stage-sub">{t('spotlight.nowSinging', { names: singers.map(nameOf).join(' & ') })}</p>
        </div>
        <ol className="scoreboard">
          {singers.map((id) => (
            <li key={id} className="score-chip" style={{ boxShadow: `inset 0 -3px 0 ${playerColor(order.indexOf(id))}` }}>
              <span className="score-name">{nameOf(id)}</span>
              <b>{formatScore(room.scores[id] ?? 0, i18n.language)}</b>
            </li>
          ))}
        </ol>
      </header>

      <div className="stage-lanes">
        {timelines.map(({ part, timeline }) => (
          <div key={part} className="stage stage-lane">
            {timelines.length > 1 && (
              <span className="lane-label">
                {singers.filter((id) => room.parts[id] === part).map(nameOf).join(' & ')}
              </span>
            )}
            <NoteLane timeline={timeline} songTime={songTime} scorer={null} trail={null} />
          </div>
        ))}
        <ReactionLayer subscribe={subscribe} nameOf={nameOf} />
        {countdown !== null && (
          <div className="countdown" aria-live="assertive">
            {countdown <= 3 ? countdown : t('game.sing.getReady')}
          </div>
        )}
      </div>

      {timelines.map(({ part, timeline }) => (
        <StageLyrics key={part} timeline={timeline} songTime={songTime} />
      ))}
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
