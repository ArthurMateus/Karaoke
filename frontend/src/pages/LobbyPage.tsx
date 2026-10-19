import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router'
import { useMe, useRoomInfo } from '../api/hooks'
import type { User } from '../api/types'
import ErrorText from '../components/ErrorText'
import QrCode from '../components/QrCode'
import { formatCode, normalizeCode } from '../lib/roomCode'
import type { LobbyPlayer } from '../room/protocol'
import { useRoomSocket } from '../room/useRoomSocket'

export default function LobbyPage() {
  const { code: rawCode = '' } = useParams()
  const code = normalizeCode(rawCode)
  const me = useMe()

  if (!code) return <ErrorText error="room_not_found" />
  if (me.isPending) return null
  // No identity yet: the join page asks for a guest name (or sign-in) first.
  if (!me.data?.user) return <Navigate to={`/join/${code}`} replace />
  return <Lobby code={code} user={me.data.user} />
}

function Lobby({ code, user }: { code: string; user: User }) {
  const { t } = useTranslation()
  const { state, send } = useRoomSocket(code)
  const roomInfo = useRoomInfo(code)
  const joinUrl = roomInfo.data?.join_url ?? `${location.origin}/join/${code}`

  if (state.status === 'ended') {
    return (
      <section className="card stack center">
        <p>{t(`lobby.ended.${state.endReason}`)}</p>
        {state.endReason === 'replaced' && (
          <button className="button" onClick={() => location.reload()}>
            {t('lobby.openHere')}
          </button>
        )}
        <Link className="button primary" to="/">
          {t('lobby.backHome')}
        </Link>
      </section>
    )
  }

  const room = state.room
  const players = room?.players ?? []
  const iAmHost = room?.host_id === user.id
  const me = players.find((p) => p.id === user.id)

  return (
    <div className="lobby">
      <section className="card invite">
        <p className="muted small">{t('lobby.code')}</p>
        <p className="room-code">{formatCode(code)}</p>
        <QrCode text={joinUrl} label={t('lobby.scanToJoin')} />
        <p className="muted small">{t('lobby.scanToJoin')}</p>
        <CopyLink url={joinUrl} />
      </section>

      <section className="card stack">
        {state.status !== 'open' && (
          <p className="banner">{state.status === 'connecting' ? t('lobby.connecting') : t('lobby.reconnecting')}</p>
        )}
        <h2>{t('lobby.players', { count: players.length, capacity: room?.capacity ?? '–' })}</h2>
        <ul className="players">
          {players.map((p) => (
            <PlayerRow
              key={p.id}
              player={p}
              isMe={p.id === user.id}
              canKick={iAmHost && p.id !== user.id}
              onKick={() => {
                if (confirm(t('lobby.confirmKick', { name: p.name }))) send({ type: 'kick', player_id: p.id })
              }}
            />
          ))}
        </ul>

        {me && (
          <button
            className={`button ${me.ready ? '' : 'primary'}`}
            onClick={() => send({ type: 'set_ready', ready: !me.ready })}
          >
            {me.ready ? t('lobby.notReady') : t('lobby.imReady')}
          </button>
        )}
        <p className="muted small">{t('lobby.comingSoon')}</p>
        {state.lastError && <ErrorText error={state.lastError} />}

        <div className="row end">
          {iAmHost ? (
            <button
              className="link-button danger"
              onClick={() => confirm(t('lobby.confirmClose')) && send({ type: 'close_room' })}
            >
              {t('lobby.closeRoom')}
            </button>
          ) : (
            <button className="link-button" onClick={() => send({ type: 'leave' })}>
              {t('lobby.leave')}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

function PlayerRow(props: { player: LobbyPlayer; isMe: boolean; canKick: boolean; onKick: () => void }) {
  const { t } = useTranslation()
  const { player } = props
  return (
    <li className={`player ${player.connected ? '' : 'away'}`}>
      <span className="avatar" aria-hidden>
        {player.name.slice(0, 1).toUpperCase()}
      </span>
      <span className="player-name">
        {player.name}
        {props.isMe && <span className="muted"> ({t('lobby.you')})</span>}
      </span>
      <span className="tags">
        {player.is_host && <span className="tag host">{t('lobby.host')}</span>}
        {player.is_guest && <span className="tag">{t('lobby.guest')}</span>}
        {!player.connected && <span className="tag warn">{t('lobby.away')}</span>}
        {player.ready && <span className="tag ok">{t('lobby.ready')}</span>}
      </span>
      {props.canKick && (
        <button className="link-button danger small" onClick={props.onKick}>
          {t('lobby.kick')}
        </button>
      )}
    </li>
  )
}

function CopyLink({ url }: { url: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      prompt(t('lobby.copyLink'), url) // clipboard blocked: let the user copy by hand
    }
  }
  return (
    <button className="button" onClick={copy}>
      {copied ? t('lobby.copied') : t('lobby.copyLink')}
    </button>
  )
}
