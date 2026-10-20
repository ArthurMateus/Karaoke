import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { playerColor } from '../lib/colors'
import { formatScore } from '../lib/format'
import { Avatar, cx } from '../ui'
import type { LobbyRoom } from './protocol'

/** Live scores of everyone singing. My own score updates instantly; others arrive per line.
 * A score that changes gives a small bump (transform only); the leader gets a gold edge. */
export default function Scoreboard({ room, singers, me, myTotal }: { room: LobbyRoom; singers: string[]; me: string; myTotal: number | null }) {
  const { t, i18n } = useTranslation()
  const order = room.players.map((p) => p.id)
  const scoreOf = (id: string) => (id === me && myTotal !== null ? myTotal : room.scores[id] ?? 0)
  const top = Math.max(0, ...singers.map(scoreOf))
  const leaders = singers.filter((id) => scoreOf(id) === top)
  return (
    <ol className="scoreboard" aria-label={t('game.sing.scoreboard')}>
      {singers.map((id) => {
        const player = room.players.find((p) => p.id === id)
        const name = player?.name ?? '…'
        const score = scoreOf(id)
        const color = playerColor(Math.max(0, order.indexOf(id)))
        const leading = singers.length > 1 && top > 0 && leaders.length === 1 && leaders[0] === id
        return (
          <li key={id} className={cx('score-chip', 'live-chip', id === me && 'mine', leading && 'leading')}
            style={{ boxShadow: `inset 0 -3px 0 ${color}`, '--chip-color': color } as CSSProperties}>
            <Avatar name={name} color={color} size="sm" decorative />
            <span className="chip-text">
              <span className="score-name">{name}</span>
              {/* A new key restarts the bump animation whenever the score moves. */}
              <b key={score} className={score > 0 ? 'bump' : undefined}>
                {formatScore(score, i18n.language)}
              </b>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
