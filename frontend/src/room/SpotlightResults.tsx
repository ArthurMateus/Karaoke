import { ArrowDown, ArrowLeft, ArrowUp, Hourglass, Minus, Play, Star } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { playerColor } from '../lib/colors'
import { formatScore } from '../lib/format'
import { Avatar, Badge, Button, cx, ProgressBar, SongCover, useCountUp } from '../ui'
import type { ClientMessage, LobbyRoom, ServerMessage, Standing } from './protocol'
import { liveStandings, placesBefore } from './ranking'
import { ReactionBar, ReactionLayer } from './Reactions'
import { ReplayPanel, type UploadState } from './ResultsView'

interface Props {
  room: LobbyRoom
  me: string
  upload: UploadState
  send: (message: ClientMessage) => void
  subscribe: (listener: (message: ServerMessage) => void) => () => void
}

const MAX_SCORE = 10000
const PITCH_SHARE = 0.7 // as in the server's turn_points: 70% pitch, 30% stars (spotlight.howPoints says the same)

/** After a Spotlight turn: the singer's points (pitch + stars), the audience's stars, tonight's standings and the replay. */
export default function SpotlightResults({ room, me, upload, send, subscribe }: Props) {
  const { t, i18n } = useTranslation()
  const singers = Object.keys(room.parts)
  const singing = singers.includes(me)
  const isHost = room.host_id === me
  const votes = room.votes
  const voted = votes?.voters.includes(me) ?? false
  const [myStars, setMyStars] = useState<number | null>(null)
  // Votes come in without new standings: remember what this turn counted for when they were sent.
  const turnPoints = votes?.points ?? {}
  const [basis, setBasis] = useState({ standings: room.standings, points: turnPoints })
  if (basis.standings !== room.standings) setBasis({ standings: room.standings, points: turnPoints })
  const standings = liveStandings(room.standings, basis.points, turnPoints)
  const order = room.players.map((p) => p.id)
  const colorOf = (id: string) => playerColor(Math.max(0, order.indexOf(id)))
  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.name ?? '…'
  const next = room.queue[0]
  const audience = room.players.filter((p) => p.connected && !singers.includes(p.id)).length
  const count = votes?.count ?? 0
  const average = votes?.average ?? null

  const vote = (stars: number) => {
    setMyStars(stars)
    send({ type: 'vote', stars })
  }

  return (
    <section className="card wide results spotlight-results">
      <ReactionLayer subscribe={subscribe} nameOf={nameOf} />
      <header className="results-head">
        {room.song && <SongCover song={room.song} size={56} />}
        <div className="results-titles">
          <span className="eyebrow">{t('spotlight.turnOver')}</span>
          <h2>{room.song?.title}</h2>
          <p className="muted small">{singers.map(nameOf).join(' & ')}</p>
        </div>
        <div className="results-actions">
          {isHost ? (
            <>
              {next && (
                <Button variant="primary" icon={Play} onClick={() => send({ type: 'start' })}>
                  {t('spotlight.startTurn', { name: nameOf(next.singer_id) })}
                </Button>
              )}
              <Button variant={next ? 'secondary' : 'primary'} icon={ArrowLeft} onClick={() => send({ type: 'back_to_lobby' })}>
                {t('spotlight.backToQueue')}
              </Button>
            </>
          ) : (
            <span className="muted small results-wait">
              <Hourglass size={16} aria-hidden />
              {t('spotlight.hostStarts')}
            </span>
          )}
        </div>
      </header>

      <div className="spot-grid">
        <div className="spot-turns">
          {singers.map((id) => (
            <TurnPoints key={id} name={nameOf(id)} color={colorOf(id)} me={id === me}
              pitch={room.scores[id] ?? 0} points={votes?.points[id] ?? room.scores[id] ?? 0} withStars={count > 0} />
          ))}
          <p className="muted small">{t('spotlight.howPoints')}</p>
        </div>

        <div className="spot-votes">
          <div className="spot-average">
            <StarScale value={average ?? 0} />
            <div className="spot-average-text">
              <b className="spot-average-number">{average !== null ? average.toLocaleString(i18n.language, { maximumFractionDigits: 1 }) : '–'}</b>
              <span className="muted small">
                {count ? t('spotlight.votes', { count, average: average?.toLocaleString(i18n.language) }) : t('spotlight.noVotesYet')}
              </span>
            </div>
          </div>
          {audience > 0 && (
            <ProgressBar value={(count / Math.max(audience, count)) * 100} tone="live" label={t('spotlight.voteMeter')}
              detail={t('spotlight.votedOf', { count, total: Math.max(audience, count) })} />
          )}
          {singing ? (
            <p className="muted small">{audience > 0 ? t('spotlight.audienceVoting') : t('spotlight.noAudience')}</p>
          ) : (
            <div className="spot-rate">
              <div className="stars" role="radiogroup" aria-label={t('spotlight.rate')}>
                {[1, 2, 3, 4, 5].map((stars) => (
                  <button key={stars} type="button" role="radio" aria-checked={myStars === stars}
                    aria-label={t('spotlight.stars', { count: stars })}
                    className={cx('star', myStars !== null && stars <= myStars && 'on')} onClick={() => vote(stars)}>
                    <Star size={34} aria-hidden fill={myStars !== null && stars <= myStars ? 'currentColor' : 'none'} />
                  </button>
                ))}
              </div>
              <p className="muted small" aria-live="polite">{voted ? t('spotlight.voted') : t('spotlight.rate')}</p>
            </div>
          )}
        </div>
      </div>

      {!singing && <ReactionBar send={send} />}

      {standings.length > 0 && (
        <MovingStandings standings={standings} singers={singers} turnPoints={turnPoints} me={me}
          nameOf={nameOf} colorOf={colorOf} />
      )}

      <ReplayPanel performanceId={room.performance_id} upload={singing ? upload : 'idle'} />
    </section>
  )
}

/** One singer's turn: big points counting up, and a bar split into the pitch part and the stars part. */
function TurnPoints({ name, color, me, pitch, points, withStars }: {
  name: string
  color: string
  me: boolean
  pitch: number
  points: number
  withStars: boolean
}) {
  const { t, i18n } = useTranslation()
  const shown = useCountUp(points, 1200)
  const pitchPart = withStars ? Math.round(pitch * PITCH_SHARE) : points
  const starsPart = withStars ? Math.max(0, points - pitchPart) : 0
  const fmt = (n: number) => formatScore(n, i18n.language)
  return (
    <div className={cx('turn-points', me && 'mine')}>
      <div className="turn-who">
        <Avatar name={name} color={color} size="lg" me={me} decorative />
        <div className="turn-name">
          <strong>{name}</strong>
          <span className="muted small">{t('spotlight.pitch', { score: fmt(pitch) })}</span>
        </div>
        <b className="turn-total">
          <span aria-hidden>{fmt(shown)}</span>
          <span className="sr-only">{t('game.results.points', { score: fmt(points) })}</span>
          <small aria-hidden>{t('game.sing.points')}</small>
        </b>
      </div>
      <div className="split-bar" aria-hidden>
        <span className="split-pitch" style={{ '--w': pitchPart / MAX_SCORE } as CSSProperties} />
        <span className="split-stars" style={{ '--w': starsPart / MAX_SCORE } as CSSProperties} />
      </div>
      <ul className="split-legend small">
        <li>
          <span className="dot pitch" aria-hidden />
          {withStars ? t('spotlight.pitchPart', { score: fmt(pitchPart) }) : t('spotlight.pitchOnly', { score: fmt(pitchPart) })}
        </li>
        {withStars && (
          <li>
            <span className="dot stars" aria-hidden />
            {t('spotlight.starsPart', { score: fmt(starsPart) })}
          </li>
        )}
      </ul>
    </div>
  )
}

/** Five stars filled up to the average (4.5 -> four and a half). */
function StarScale({ value }: { value: number }) {
  const { t, i18n } = useTranslation()
  const part = Math.max(0, Math.min(1, value / 5))
  return (
    <span className="star-scale" role="img" aria-label={t('spotlight.averageStars', { average: value.toLocaleString(i18n.language) })}>
      <span className="star-row empty">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} size={30} aria-hidden />
        ))}
      </span>
      <span className="star-row full" style={{ clipPath: `inset(0 ${(1 - part) * 100}% 0 0)` }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} size={30} fill="currentColor" aria-hidden />
        ))}
      </span>
    </span>
  )
}

/** Tonight's standings, with arrows for who moved up or down with this turn. */
function MovingStandings({ standings, singers, turnPoints, me, nameOf, colorOf }: {
  standings: Standing[]
  singers: string[]
  turnPoints: Record<string, number>
  me: string
  nameOf: (id: string) => string
  colorOf: (id: string) => string
}) {
  const { t, i18n } = useTranslation()
  const before = placesBefore(standings, singers, turnPoints)
  return (
    <div className="spot-standings">
      <h3>{t('spotlight.standings')}</h3>
      <ol className="ranking">
        {standings.map((row, i) => {
          const place = i + 1
          const was = before.get(row.id)
          const moved = was === undefined ? null : was - place
          return (
            <li key={row.id} className={cx('rank', row.id === me && 'me', singers.includes(row.id) && 'just-sang')}>
              <span className={cx('rank-place', place <= 3 && `medal-${place}`)}>
                <span aria-hidden>{place}</span>
                <span className="sr-only">{t('game.results.place', { place })}</span>
              </span>
              <Avatar name={nameOf(row.id)} color={colorOf(row.id)} size="sm" decorative />
              <span className="player-name">
                {nameOf(row.id)}
                <span className="muted small player-sub">{t('spotlight.turns', { count: row.turns })}</span>
              </span>
              <Movement moved={moved} />
              <b className="rank-score">{t('game.results.points', { score: formatScore(row.points, i18n.language) })}</b>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function Movement({ moved }: { moved: number | null }) {
  const { t } = useTranslation()
  if (moved === null) return <Badge tone="violet">{t('spotlight.rankNew')}</Badge>
  if (moved === 0)
    return (
      <span className="move same" title={t('spotlight.rankSame')}>
        <Minus size={14} aria-hidden />
        <span className="sr-only">{t('spotlight.rankSame')}</span>
      </span>
    )
  const up = moved > 0
  const label = up ? t('spotlight.rankUp', { count: moved }) : t('spotlight.rankDown', { count: -moved })
  return (
    <span className={cx('move', up ? 'up' : 'down')} title={label}>
      {up ? <ArrowUp size={14} strokeWidth={2.75} aria-hidden /> : <ArrowDown size={14} strokeWidth={2.75} aria-hidden />}
      <span aria-hidden>{Math.abs(moved)}</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}
