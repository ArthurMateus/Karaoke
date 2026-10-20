import { ChevronDown, ChevronUp, GripVertical, ListMusic, Mic, Plus, Trophy, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Song } from '../api/types'
import { playerColor } from '../lib/colors'
import { formatScore } from '../lib/format'
import { Avatar, AvatarStack, Badge, Button, Card, EmptyState, IconButton, SongCover, cx } from '../ui'
import type { ClientMessage, LobbyRoom, Standing } from './protocol'
import SongPicker from './SongPicker'
import { nextTurnBlockers } from './turns'

interface Props {
  room: LobbyRoom
  me: string
  send: (message: ClientMessage) => void
}

/** Spotlight in the lobby: the queue of turns, signing up for one, and tonight's standings. */
export default function SpotlightLobby({ room, me, send }: Props) {
  const { t } = useTranslation()
  const isHost = room.host_id === me
  const nameOf = (id: string | null) => room.players.find((p) => p.id === id)?.name ?? '…'
  const colorOf = (id: string) => playerColor(Math.max(0, room.players.findIndex((p) => p.id === id)))
  const next = room.queue[0]
  const nextNotReady = nextTurnBlockers(room)

  return (
    <>
      <Card eyebrow={t('spotlight.queue')} icon={ListMusic} wide
        actions={room.queue.length > 0 && <Badge tone="neutral">{room.queue.length}</Badge>}>
        {room.queue.length === 0 ? (
          <EmptyState compact text={t('spotlight.queueEmpty')} />
        ) : (
          <ol className="queue">
            {room.queue.map((entry, i) => {
              const mine = entry.singer_id === me || entry.partner_id === me
              const singers = [entry.singer_id, entry.partner_id].filter((id): id is string => !!id)
              const who = entry.partner_id ? t('spotlight.duetBy', { a: nameOf(entry.singer_id), b: nameOf(entry.partner_id) }) : nameOf(entry.singer_id)
              return (
                <li key={entry.id} className={cx('queue-entry', i === 0 && 'next', mine && 'mine')}>
                  {isHost && room.queue.length > 1 && <GripVertical size={16} className="queue-grip" aria-hidden />}
                  <span className="queue-place" aria-hidden>
                    {i + 1}
                  </span>
                  <SongCover song={entry.song} size={48} />
                  <div className="pick-main">
                    {i === 0 && (
                      <Badge tone="live" className="queue-next">
                        {t('spotlight.nextUp')}
                      </Badge>
                    )}
                    <strong>{entry.song.title}</strong>
                    <span className="queue-who small">
                      <span aria-hidden>
                        <AvatarStack people={singers.map((id) => ({ id, name: nameOf(id), color: colorOf(id) }))} label={who} />
                      </span>
                      <span className="muted">{who}</span>
                    </span>
                  </div>
                  <span className="queue-actions">
                    {isHost && i > 0 && (
                      <IconButton icon={ChevronUp} size="sm" label={`${t('spotlight.moveUp')}: ${entry.song.title}`}
                        onClick={() => send({ type: 'queue_move', entry_id: entry.id, delta: -1 })} />
                    )}
                    {isHost && i < room.queue.length - 1 && (
                      <IconButton icon={ChevronDown} size="sm" label={`${t('spotlight.moveDown')}: ${entry.song.title}`}
                        onClick={() => send({ type: 'queue_move', entry_id: entry.id, delta: 1 })} />
                    )}
                    {(isHost || mine) && (
                      <IconButton icon={X} size="sm" className="danger" label={`${t('spotlight.remove')}: ${entry.song.title}`}
                        onClick={() => send({ type: 'queue_remove', entry_id: entry.id })} />
                    )}
                  </span>
                </li>
              )
            })}
          </ol>
        )}

        {isHost ? (
          <>
            <Button variant="primary" size="lg" block icon={Mic} className="hide-on-phone" disabled={!next || nextNotReady.length > 0}
              onClick={() => send({ type: 'start' })}>
              {next ? t('spotlight.startTurn', { name: nameOf(next.singer_id) }) : t('spotlight.startTurnEmpty')}
            </Button>
            {nextNotReady.length > 0 && (
              <p className="muted small">{t('spotlight.waitingFor', { names: nextNotReady.map(nameOf).join(', ') })}</p>
            )}
          </>
        ) : (
          <p className="muted small">{t('spotlight.hostStarts')}</p>
        )}

        <AddTurn room={room} me={me} send={send} />
      </Card>

      {room.standings.length > 0 && <Standings room={room} standings={room.standings} />}
    </>
  )
}

/** Sign up for a turn: pick a song, and a partner if it's a duet. */
function AddTurn({ room, me, send }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [song, setSong] = useState<Song | null>(null)
  const [partner, setPartner] = useState('')
  const others = room.players.filter((p) => p.id !== me)

  const add = (picked: Song, partnerId: string | null) => {
    send({ type: 'queue_add', song_id: picked.id, partner_id: partnerId })
    setSong(null)
    setPartner('')
    setOpen(false)
  }

  if (!open) {
    return (
      <Button icon={Plus} onClick={() => setOpen(true)}>
        {t('spotlight.addTurn')}
      </Button>
    )
  }

  if (song?.is_duet) {
    return (
      <div className="add-turn stack tight">
        <div className="chosen-song">
          <SongCover song={song} size={48} />
          <div className="pick-main">
            <strong>{song.title}</strong>
            <span className="muted small">{t('spotlight.partnerHelp')}</span>
          </div>
        </div>
        <label htmlFor="duet-partner">{t('spotlight.partner')}</label>
        <select id="duet-partner" className="input" value={partner} onChange={(e) => setPartner(e.target.value)}>
          <option value="">{t('spotlight.alone')}</option>
          {others.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="row wrap">
          <Button variant="primary" icon={Plus} onClick={() => add(song, partner || null)}>
            {t('spotlight.addToQueue')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSong(null)}>
            {t('spotlight.otherSong')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="add-turn stack tight">
      <div className="row spread">
        <strong>{t('spotlight.pickYourSong')}</strong>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t('lyrics.cancel')}
        </Button>
      </div>
      <SongPicker code={room.code} selectedId={null} isHost={room.host_id === me}
        onPick={(picked) => (picked.is_duet ? setSong(picked) : add(picked, null))} />
    </div>
  )
}

/** Tonight's Spotlight ranking: pitch score blended with the audience's stars. */
export function Standings({ room, standings }: { room: LobbyRoom; standings: Standing[] }) {
  const { t, i18n } = useTranslation()
  const order = room.players.map((p) => p.id)
  return (
    <Card eyebrow={t('spotlight.standings')} icon={Trophy} wide>
      <ol className="ranking">
        {standings.map((row, i) => {
          const name = room.players.find((p) => p.id === row.id)?.name ?? '…'
          return (
            <li key={row.id} className={cx('rank', i === 0 && 'first')}>
              <span className={cx('rank-place', i < 3 && `medal-${i + 1}`)}>{i + 1}</span>
              <Avatar name={name} color={playerColor(Math.max(0, order.indexOf(row.id)))} size="sm" decorative />
              <span className="player-name">
                {name} <span className="muted small">{t('spotlight.turns', { count: row.turns })}</span>
              </span>
              <b className="rank-score">{t('game.results.points', { score: formatScore(row.points, i18n.language) })}</b>
            </li>
          )
        })}
      </ol>
      <p className="muted small">{t('spotlight.howPoints')}</p>
    </Card>
  )
}
