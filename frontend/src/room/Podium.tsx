import { Crown } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { formatScore } from '../lib/format'
import { Avatar, cx, useCountUp } from '../ui'

export interface Placed {
  id: string
  name: string
  score: number
  color: string
  place: number // 1-based; equal scores share a place
}

/** The top three on steps (2nd, 1st, 3rd from left to right), with medals and scores counting up. */
export function Podium({ top, me }: { top: Placed[]; me: string }) {
  // Visual order: second on the left, the winner in the middle, third on the right.
  const order = [top[1], top[0], top[2]].filter((p): p is Placed => !!p)
  return (
    <ol className={cx('podium', `podium-${top.length}`)}>
      {order.map((p) => (
        <PodiumStep key={p.id} entry={p} rank={top.indexOf(p) + 1} me={p.id === me} />
      ))}
    </ol>
  )
}

function PodiumStep({ entry, rank, me }: { entry: Placed; rank: number; me: boolean }) {
  const { t, i18n } = useTranslation()
  const shown = useCountUp(entry.score, 1200)
  const medal = Math.min(entry.place, 3)
  return (
    <li className={cx('podium-step', `step-${rank}`, me && 'mine')} style={{ '--delay': `${(3 - rank) * 120}ms` } as CSSProperties}>
      <div className="podium-who">
        <span className="podium-avatar">
          {entry.place === 1 && (
            <span className="podium-crown" aria-hidden>
              <Crown size={20} strokeWidth={2.5} />
            </span>
          )}
          <Avatar name={entry.name} color={entry.color} size={rank === 1 ? 'xl' : 'lg'} me={me} decorative />
        </span>
        <span className="podium-name">
          {entry.name}
          {me && <span className="muted"> ({t('lobby.you')})</span>}
        </span>
        <b className="podium-score">
          <span aria-hidden>{formatScore(shown, i18n.language)}</span>
          <span className="sr-only">{t('game.results.points', { score: formatScore(entry.score, i18n.language) })}</span>
        </b>
      </div>
      <div className={cx('podium-block', `medal-${medal}`)}>
        <span className="podium-place">
          <span aria-hidden>{entry.place}</span>
          <span className="sr-only">{t('game.results.place', { place: entry.place })}</span>
        </span>
      </div>
    </li>
  )
}

/** Everyone after the podium, as a plain list. */
export function RankList({ rest, me }: { rest: Placed[]; me: string }) {
  const { t, i18n } = useTranslation()
  if (!rest.length) return null
  return (
    <ol className="ranking rest-ranking" start={rest[0].place}>
      {rest.map((p) => (
        <li key={p.id} className={cx('rank', p.id === me && 'me')}>
          <span className="rank-place">
            <span aria-hidden>{p.place}</span>
            <span className="sr-only">{t('game.results.place', { place: p.place })}</span>
          </span>
          <Avatar name={p.name} color={p.color} size="sm" decorative />
          <span className="player-name">
            {p.name}
            {p.id === me && <span className="muted"> ({t('lobby.you')})</span>}
          </span>
          <b className="rank-score">{t('game.results.points', { score: formatScore(p.score, i18n.language) })}</b>
        </li>
      ))}
    </ol>
  )
}
