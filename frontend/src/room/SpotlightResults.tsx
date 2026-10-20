import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { playerColor } from '../lib/colors'
import { formatScore } from '../lib/format'
import type { ClientMessage, LobbyRoom, ServerMessage } from './protocol'
import { ReactionBar, ReactionLayer } from './Reactions'
import { ReplayPanel, type UploadState } from './ResultsView'

interface Props {
  room: LobbyRoom
  me: string
  upload: UploadState
  send: (message: ClientMessage) => void
  subscribe: (listener: (message: ServerMessage) => void) => () => void
}

/** After a Spotlight turn: the singer's score, the audience's stars, and the replay. */
export default function SpotlightResults({ room, me, upload, send, subscribe }: Props) {
  const { t, i18n } = useTranslation()
  const singers = Object.keys(room.parts)
  const singing = singers.includes(me)
  const isHost = room.host_id === me
  const votes = room.votes
  const voted = votes?.voters.includes(me) ?? false
  const [myStars, setMyStars] = useState<number | null>(null)
  const order = room.players.map((p) => p.id)
  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.name ?? '…'
  const next = room.queue[0]
  const audience = room.players.filter((p) => p.connected && !singers.includes(p.id)).length

  const vote = (stars: number) => {
    setMyStars(stars)
    send({ type: 'vote', stars })
  }

  return (
    <section className="card wide results spotlight-results">
      <ReactionLayer subscribe={subscribe} nameOf={nameOf} />
      <div className="row spread wrap">
        <div>
          <span className="eyebrow">{t('spotlight.turnOver')}</span>
          <h2>{room.song?.title}</h2>
        </div>
        {isHost ? (
          <div className="row wrap">
            {next && (
              <button className="button primary" onClick={() => send({ type: 'start' })}>
                {t('spotlight.startTurn', { name: nameOf(next.singer_id) })}
              </button>
            )}
            <button className="button" onClick={() => send({ type: 'back_to_lobby' })}>
              {t('spotlight.backToQueue')}
            </button>
          </div>
        ) : (
          <span className="muted small">{t('spotlight.hostStarts')}</span>
        )}
      </div>

      <ol className="ranking">
        {singers.map((id) => (
          <li key={id} className="rank">
            <span className="avatar" style={{ background: playerColor(order.indexOf(id)) }} aria-hidden>
              {nameOf(id).slice(0, 1).toUpperCase()}
            </span>
            <span className="player-name">
              {nameOf(id)}
              <span className="muted small"> · {t('spotlight.pitch', { score: formatScore(room.scores[id] ?? 0, i18n.language) })}</span>
            </span>
            <b className="rank-score">{t('game.results.points', { score: formatScore(votes?.points[id] ?? room.scores[id] ?? 0, i18n.language) })}</b>
          </li>
        ))}
      </ol>

      <div className="stack tight">
        <strong>
          {votes?.count
            ? t('spotlight.votes', { count: votes.count, average: votes.average?.toLocaleString(i18n.language) })
            : t('spotlight.noVotesYet')}
        </strong>
        {singing ? (
          <p className="muted small">{audience > 0 ? t('spotlight.audienceVoting') : t('spotlight.noAudience')}</p>
        ) : (
          <>
            <div className="stars" role="radiogroup" aria-label={t('spotlight.rate')}>
              {[1, 2, 3, 4, 5].map((stars) => (
                <button key={stars} type="button" role="radio" aria-checked={myStars === stars}
                  aria-label={t('spotlight.stars', { count: stars })}
                  className={`star ${myStars !== null && stars <= myStars ? 'on' : ''}`} onClick={() => vote(stars)}>
                  ★
                </button>
              ))}
            </div>
            <p className="muted small">{voted ? t('spotlight.voted') : t('spotlight.rate')}</p>
          </>
        )}
        <p className="muted small">{t('spotlight.howPoints')}</p>
      </div>

      {!singing && <ReactionBar send={send} />}
      <ReplayPanel performanceId={room.performance_id} upload={singing ? upload : 'idle'} />
    </section>
  )
}
