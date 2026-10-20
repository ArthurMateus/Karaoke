import { UserPlus, UserX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { playerColor } from '../lib/colors'
import { Avatar, Badge, Card, IconButton, cx } from '../ui'
import type { LobbyPlayer } from './protocol'
import { usePresence } from './usePresence'

interface Props {
  players: LobbyPlayer[]
  capacity: number | null
  me: string
  isHost: boolean
  onKick: (player: LobbyPlayer) => void
}

/** Everyone in the room as avatar cards: host crown, ready check, "you", away; cards pop in and out. */
export default function PlayerGrid({ players, capacity, me, isHost, onKick }: Props) {
  const { t } = useTranslation()
  const shown = usePresence(players, (p) => p.id)
  const readyCount = players.filter((p) => p.ready && p.connected).length
  const free = capacity == null ? 0 : capacity - players.length

  return (
    <Card
      title={t('lobby.players', { count: players.length, capacity: capacity ?? '–' })}
      actions={readyCount > 0 && <Badge tone="ok">{t('lobby.readyCount', { count: readyCount })}</Badge>}
      wide
    >
      <ul className="player-grid">
        {shown.map(({ item: p, leaving }) => {
          // Colours follow the join order, so everyone sees the same colour for the same person.
          const index = players.findIndex((x) => x.id === p.id)
          const isMe = p.id === me
          return (
            <li key={p.id} className={cx('player-card', p.ready && p.connected && 'ready', !p.connected && 'away', isMe && 'me', leaving && 'leaving')}>
              <Avatar name={p.name} color={playerColor(index < 0 ? 0 : index)} size="lg" host={p.is_host} ready={p.ready && p.connected}
                away={!p.connected} me={isMe} decorative />
              <span className="player-card-name">
                {p.name}
                {isMe && <span className="muted"> ({t('lobby.you')})</span>}
              </span>
              <span className="player-card-status">
                {!p.connected ? (
                  <Badge tone="warn">{t('lobby.away')}</Badge>
                ) : p.ready ? (
                  <Badge tone="ok">{t('lobby.ready')}</Badge>
                ) : (
                  <Badge tone="neutral">{t('lobby.notReady')}</Badge>
                )}
                {p.is_host ? (
                  <span className="small muted">{t('lobby.host')}</span>
                ) : (
                  p.is_guest && <span className="small muted">{t('lobby.guest')}</span>
                )}
              </span>
              {isHost && !isMe && !leaving && (
                <IconButton icon={UserX} label={t('lobby.kickLabel', { name: p.name })} size="sm" variant="ghost" className="player-kick danger"
                  onClick={() => onKick(p)} />
              )}
            </li>
          )
        })}
        {free > 0 && (
          <li className="player-slot">
            <span className="slot-icon" aria-hidden>
              <UserPlus size={20} />
            </span>
            <span className="small">{t('lobby.waitingSlot')}</span>
            <span className="small muted">{t('lobby.spotsLeft', { count: free })}</span>
          </li>
        )}
      </ul>
    </Card>
  )
}
