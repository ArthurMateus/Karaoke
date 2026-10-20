import { Mic, Star, Trophy, Users } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useRoomInfo } from '../api/hooks'
import QrCode from '../components/QrCode'
import { playerColor } from '../lib/colors'
import { formatScore } from '../lib/format'
import { formatCode } from '../lib/roomCode'
import type { LobbyRoom, RoomSong, ServerMessage } from '../room/protocol'
import { ReactionLayer } from '../room/Reactions'
import { Avatar } from '../ui/Avatar'
import { Badge } from '../ui/Badge'
import { SongCover } from '../ui/SongCover'
import { cx } from '../ui/cx'

interface Row {
  id: string
  points: number
  turns?: number
}

/** Between songs, read from across the room: how to join, what's next, and the scores so far. */
export default function StageLobby({ room, code, subscribe, nameOf }: {
  room: LobbyRoom
  code: string
  subscribe: (listener: (message: ServerMessage) => void) => () => void
  nameOf: (id: string) => string
}) {
  const { t } = useTranslation()
  const order = room.players.map((p) => p.id)
  const colorOf = (id: string) => playerColor(Math.max(0, order.indexOf(id)))
  const spotlight = room.mode === 'spotlight'

  // After a song: this turn's (Spotlight) or this song's (Sing Together) ranking.
  const results: Row[] | null =
    room.phase === 'results'
      ? Object.keys(room.parts)
          .map((id) => ({ id, points: room.votes?.points[id] ?? room.scores[id] ?? 0 }))
          .sort((a, b) => b.points - a.points)
      : null
  const standings: Row[] = spotlight ? room.standings.map((s) => ({ id: s.id, points: s.points, turns: s.turns })) : []
  const rows = results ?? standings
  const boardTitle = results ? t('game.results.title') : t('spotlight.standings')

  return (
    <div className="stage-lobby">
      <ReactionLayer subscribe={subscribe} nameOf={nameOf} />
      <JoinPanel room={room} code={code} colorOf={colorOf} />

      <div className="stage-main">
        {results ? (
          <JustSung room={room} spotlight={spotlight} nameOf={nameOf} colorOf={colorOf} />
        ) : (
          <UpNext room={room} spotlight={spotlight} nameOf={nameOf} colorOf={colorOf} />
        )}
        {rows.length > 0 && (
          <Scoreboard title={boardTitle} rows={rows} nameOf={nameOf} colorOf={colorOf} trophy={!results} />
        )}
      </div>
    </div>
  )
}

/** The QR code, the room code in huge letters, and who's here. */
function JoinPanel({ room, code, colorOf }: { room: LobbyRoom; code: string; colorOf: (id: string) => string }) {
  const { t } = useTranslation()
  const info = useRoomInfo(code)
  const joinUrl = info.data?.join_url ?? `${location.origin}/join/${code}`
  const shortUrl = joinUrl.replace(/^https?:\/\//, '').replace(/\/join\/.*$/, '/join')
  const here = room.players.filter((p) => p.connected)
  const shown = here.slice(0, 8)
  return (
    <section className="stage-join" aria-label={t('stage.join')}>
      <div className="stage-qr">
        <QrCode text={joinUrl} label={t('lobby.scanToJoin')} />
      </div>
      <p className="stage-eyebrow">{t('stage.join')}</p>
      <p className="stage-code">{formatCode(code)}</p>
      <p className="stage-url">{t('stage.orVisit', { url: shortUrl })}</p>
      <div className="stage-here">
        {shown.length > 0 && (
          <span className="stage-here-avatars" aria-hidden>
            {shown.map((p) => (
              <Avatar key={p.id} name={p.name} color={colorOf(p.id)} size="lg" host={p.is_host} decorative />
            ))}
            {here.length > shown.length && <span className="avatar lg more">+{here.length - shown.length}</span>}
          </span>
        )}
        <span className="stage-here-count">
          <Users size={22} aria-hidden />
          {t('stage.players', { count: room.players.length })}
        </span>
      </div>
    </section>
  )
}

/** A song with its cover, title and artist, in the big card. */
function SongHeading({ song, eyebrow }: { song: RoomSong; eyebrow: string }) {
  const { t } = useTranslation()
  return (
    <div className="stage-song">
      <SongCover song={song} size={160} className="stage-cover" />
      <div className="stage-song-text">
        <p className="stage-eyebrow">{eyebrow}</p>
        <h1 className="stage-title">{song.title}</h1>
        <p className="stage-artist">
          {song.artist}
          {song.is_duet && <Badge tone="violet" className="stage-duet">{t('songs.duet')}</Badge>}
        </p>
      </div>
    </div>
  )
}

/** Who sings, as big avatars with names. */
function Singers({ ids, nameOf, colorOf, readyOf }: {
  ids: string[]
  nameOf: (id: string) => string
  colorOf: (id: string) => string
  readyOf?: (id: string) => boolean
}) {
  return (
    <ul className="stage-singers">
      {ids.map((id) => (
        <li key={id} className={cx('stage-singer', readyOf && !readyOf(id) && 'waiting')}>
          <Avatar name={nameOf(id)} color={colorOf(id)} size="xl" ready={readyOf?.(id)} decorative />
          <span className="stage-singer-name">{nameOf(id)}</span>
        </li>
      ))}
    </ul>
  )
}

function UpNext({ room, spotlight, nameOf, colorOf }: {
  room: LobbyRoom
  spotlight: boolean
  nameOf: (id: string) => string
  colorOf: (id: string) => string
}) {
  const { t } = useTranslation()
  if (spotlight) {
    const [next, ...later] = room.queue
    if (!next) {
      return (
        <section className="stage-panel stage-next empty">
          <Mic size={56} aria-hidden className="stage-empty-icon" />
          <p className="stage-eyebrow">{t('stage.upNext')}</p>
          <h1 className="stage-title">{t('stage.queueEmpty')}</h1>
        </section>
      )
    }
    const singers = next.partner_id ? [next.singer_id, next.partner_id] : [next.singer_id]
    return (
      <section className="stage-panel stage-next">
        <SongHeading song={next.song} eyebrow={t('stage.upNext')} />
        <Singers ids={singers} nameOf={nameOf} colorOf={colorOf} />
        {later.length > 0 && (
          <div className="stage-later">
            <span className="stage-eyebrow">{t('stage.then')}</span>
            <ol>
              {later.slice(0, 3).map((entry) => (
                <li key={entry.id}>
                  <Avatar name={nameOf(entry.singer_id)} color={colorOf(entry.singer_id)} size="md" decorative />
                  <span className="stage-later-text">
                    <b>{nameOf(entry.singer_id)}</b>
                    <span>{entry.song.title}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
    )
  }

  // Sing Together: the host's song, and everyone in the room sings it.
  if (!room.song) {
    return (
      <section className="stage-panel stage-next empty">
        <Mic size={56} aria-hidden className="stage-empty-icon" />
        <p className="stage-eyebrow">{t('stage.upNext')}</p>
        <h1 className="stage-title">{t('stage.noSong')}</h1>
      </section>
    )
  }
  const players = room.players.filter((p) => p.connected)
  const ready = players.filter((p) => p.ready).length
  return (
    <section className="stage-panel stage-next">
      <SongHeading song={room.song} eyebrow={t('stage.upNext')} />
      <Singers ids={players.slice(0, 8).map((p) => p.id)} nameOf={nameOf} colorOf={colorOf}
        readyOf={(id) => !!room.players.find((p) => p.id === id)?.ready} />
      <p className="stage-ready">{t('stage.readyOf', { ready, count: players.length })}</p>
    </section>
  )
}

/** After a song: what was sung, by whom, the audience's stars and the next turn. */
function JustSung({ room, spotlight, nameOf, colorOf }: {
  room: LobbyRoom
  spotlight: boolean
  nameOf: (id: string) => string
  colorOf: (id: string) => string
}) {
  const { t, i18n } = useTranslation()
  const next = spotlight ? room.queue[0] : undefined
  // As on the phones: only people in the room who didn't sing this turn can vote.
  const singers = Object.keys(room.parts)
  const audience = room.players.filter((p) => p.connected && !singers.includes(p.id)).length
  return (
    <section className="stage-panel stage-next">
      {room.song && <SongHeading song={room.song} eyebrow={spotlight ? t('spotlight.turnOver') : t('stage.songOver')} />}
      {spotlight && (
        <p className={cx('stage-votes', !room.votes?.count && 'waiting')}>
          <Star size={34} aria-hidden fill="currentColor" />
          {room.votes?.count
            ? t('spotlight.votes', { count: room.votes.count, average: room.votes.average?.toLocaleString(i18n.language) })
            : audience > 0 ? t('stage.voteNow') : t('stage.noVoters')}
        </p>
      )}
      {next && (
        <p className="stage-then-one">
          <span className="stage-eyebrow">{t('stage.upNext')}</span>
          <span className="stage-then-avatars">
            {[next.singer_id, ...(next.partner_id ? [next.partner_id] : [])].map((id) => (
              <Avatar key={id} name={nameOf(id)} color={colorOf(id)} size="md" decorative />
            ))}
          </span>
          <b>{next.partner_id ? t('spotlight.duetBy', { a: nameOf(next.singer_id), b: nameOf(next.partner_id) }) : nameOf(next.singer_id)}</b>
          <span className="stage-then-song">{next.song.title}</span>
        </p>
      )}
    </section>
  )
}

/** The big scoreboard: medals, avatars, points and a bar for each. */
function Scoreboard({ title, rows, nameOf, colorOf, trophy }: {
  title: string
  rows: Row[]
  nameOf: (id: string) => string
  colorOf: (id: string) => string
  trophy: boolean
}) {
  const { t, i18n } = useTranslation()
  const top = Math.max(1, ...rows.map((r) => r.points))
  return (
    <section className="stage-panel stage-board" aria-label={title}>
      <p className="stage-eyebrow">
        {trophy && <Trophy size={20} aria-hidden />}
        {title}
      </p>
      <ol className="stage-ranks">
        {rows.slice(0, 5).map((row, i) => (
          <li key={row.id} className={cx('stage-rank', i === 0 && 'first')}
            style={{ '--bar': (row.points / top).toFixed(3), '--row-color': colorOf(row.id) } as CSSProperties}>
            <span className="stage-rank-bar" aria-hidden />
            <span className={cx('stage-place', i < 3 && `medal-${i + 1}`)}>{i + 1}</span>
            <Avatar name={nameOf(row.id)} color={colorOf(row.id)} size="lg" decorative />
            <span className="stage-rank-name">
              {nameOf(row.id)}
              {row.turns != null && <small>{t('spotlight.turns', { count: row.turns })}</small>}
            </span>
            <b className="stage-rank-score">{t('game.results.points', { score: formatScore(row.points, i18n.language) })}</b>
          </li>
        ))}
      </ol>
    </section>
  )
}
