import { playerColor } from '../lib/colors'
import type { LobbyRoom } from './protocol'

/** Live scores of everyone singing. My own score updates instantly; others arrive per line. */
export default function Scoreboard({ room, singers, me, myTotal }: { room: LobbyRoom; singers: string[]; me: string; myTotal: number | null }) {
  const order = room.players.map((p) => p.id)
  return (
    <ol className="scoreboard">
      {singers.map((id) => {
        const player = room.players.find((p) => p.id === id)
        const score = id === me && myTotal !== null ? myTotal : room.scores[id] ?? 0
        return (
          <li key={id} className="score-chip" style={{ boxShadow: `inset 0 -3px 0 ${playerColor(order.indexOf(id))}` }}>
            <span className="score-name">{player?.name ?? '…'}</span>
            <b>{score.toLocaleString()}</b>
          </li>
        )
      })}
    </ol>
  )
}
