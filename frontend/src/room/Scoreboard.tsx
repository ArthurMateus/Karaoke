import { useTranslation } from 'react-i18next'
import { playerColor } from '../lib/colors'
import { formatScore } from '../lib/format'
import type { LobbyRoom } from './protocol'

/** Live scores of everyone singing. My own score updates instantly; others arrive per line. */
export default function Scoreboard({ room, singers, me, myTotal }: { room: LobbyRoom; singers: string[]; me: string; myTotal: number | null }) {
  const { i18n } = useTranslation()
  const order = room.players.map((p) => p.id)
  return (
    <ol className="scoreboard">
      {singers.map((id) => {
        const player = room.players.find((p) => p.id === id)
        const score = id === me && myTotal !== null ? myTotal : room.scores[id] ?? 0
        return (
          <li key={id} className="score-chip" style={{ boxShadow: `inset 0 -3px 0 ${playerColor(order.indexOf(id))}` }}>
            <span className="score-name">{player?.name ?? '…'}</span>
            <b>{formatScore(score, i18n.language)}</b>
          </li>
        )
      })}
    </ol>
  )
}
