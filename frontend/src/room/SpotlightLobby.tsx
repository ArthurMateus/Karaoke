import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Song } from '../api/types'
import { playerColor } from '../lib/colors'
import { formatScore } from '../lib/format'
import type { ClientMessage, LobbyRoom, Standing } from './protocol'
import SongPicker from './SongPicker'

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
  const next = room.queue[0]
  const nextNotReady = next
    ? [next.singer_id, next.partner_id].filter((id): id is string => !!id).filter((id) => {
        const player = room.players.find((p) => p.id === id)
        return !player || !player.connected || !player.ready
      })
    : []

  return (
    <>
      <section className="card stack">
        <span className="eyebrow">{t('spotlight.queue')}</span>
        {room.queue.length === 0 ? (
          <p className="muted">{t('spotlight.queueEmpty')}</p>
        ) : (
          <ol className="queue">
            {room.queue.map((entry, i) => {
              const mine = entry.singer_id === me || entry.partner_id === me
              return (
                <li key={entry.id} className={`queue-entry ${i === 0 ? 'next' : ''}`}>
                  <span className="queue-place">{i === 0 ? t('spotlight.nextUp') : i + 1}</span>
                  <div className="pick-main">
                    <strong>{entry.song.title}</strong>
                    <span className="muted small">
                      {entry.partner_id
                        ? t('spotlight.duetBy', { a: nameOf(entry.singer_id), b: nameOf(entry.partner_id) })
                        : nameOf(entry.singer_id)}
                    </span>
                  </div>
                  <span className="row tight">
                    {isHost && i > 0 && (
                      <button className="link-button small" aria-label={t('spotlight.moveUp')}
                        onClick={() => send({ type: 'queue_move', entry_id: entry.id, delta: -1 })}>↑</button>
                    )}
                    {isHost && i < room.queue.length - 1 && (
                      <button className="link-button small" aria-label={t('spotlight.moveDown')}
                        onClick={() => send({ type: 'queue_move', entry_id: entry.id, delta: 1 })}>↓</button>
                    )}
                    {(isHost || mine) && (
                      <button className="link-button danger small" onClick={() => send({ type: 'queue_remove', entry_id: entry.id })}>
                        {t('spotlight.remove')}
                      </button>
                    )}
                  </span>
                </li>
              )
            })}
          </ol>
        )}

        {isHost ? (
          <>
            <button className="button primary big" disabled={!next || nextNotReady.length > 0} onClick={() => send({ type: 'start' })}>
              {next ? t('spotlight.startTurn', { name: nameOf(next.singer_id) }) : t('spotlight.startTurnEmpty')}
            </button>
            {nextNotReady.length > 0 && (
              <p className="muted small">{t('spotlight.waitingFor', { names: nextNotReady.map(nameOf).join(', ') })}</p>
            )}
          </>
        ) : (
          <p className="muted small">{t('spotlight.hostStarts')}</p>
        )}

        <AddTurn room={room} me={me} send={send} />
      </section>

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
      <button className="button" onClick={() => setOpen(true)}>
        {t('spotlight.addTurn')}
      </button>
    )
  }

  if (song?.is_duet) {
    return (
      <div className="stack tight">
        <strong>{song.title}</strong>
        <label htmlFor="duet-partner">{t('spotlight.partner')}</label>
        <select id="duet-partner" className="input" value={partner} onChange={(e) => setPartner(e.target.value)}>
          <option value="">{t('spotlight.alone')}</option>
          {others.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <p className="muted small">{t('spotlight.partnerHelp')}</p>
        <div className="row wrap">
          <button className="button primary" onClick={() => add(song, partner || null)}>
            {t('spotlight.addToQueue')}
          </button>
          <button className="link-button small" onClick={() => setSong(null)}>
            {t('spotlight.otherSong')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="stack tight">
      <div className="row spread">
        <strong>{t('spotlight.pickYourSong')}</strong>
        <button className="link-button small" onClick={() => setOpen(false)}>
          {t('lyrics.cancel')}
        </button>
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
    <section className="card stack">
      <span className="eyebrow">{t('spotlight.standings')}</span>
      <ol className="ranking">
        {standings.map((row, i) => {
          const name = room.players.find((p) => p.id === row.id)?.name ?? '…'
          return (
            <li key={row.id} className={`rank ${i === 0 ? 'first' : ''}`}>
              <span className="rank-place">{i + 1}</span>
              <span className="avatar" style={{ background: playerColor(order.indexOf(row.id)) }} aria-hidden>
                {name.slice(0, 1).toUpperCase()}
              </span>
              <span className="player-name">
                {name} <span className="muted small">{t('spotlight.turns', { count: row.turns })}</span>
              </span>
              <b className="rank-score">{t('game.results.points', { score: formatScore(row.points, i18n.language) })}</b>
            </li>
          )
        })}
      </ol>
      <p className="muted small">{t('spotlight.howPoints')}</p>
    </section>
  )
}
