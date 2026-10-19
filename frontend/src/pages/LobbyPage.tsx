import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router'
import { useMe, useRoomInfo } from '../api/hooks'
import type { User } from '../api/types'
import ErrorText from '../components/ErrorText'
import QrCode from '../components/QrCode'
import { playerColor } from '../lib/colors'
import { formatCode, normalizeCode } from '../lib/roomCode'
import { savedLatency } from '../audio/calibration'
import type { AudioEngine } from '../audio/engine'
import { useClockSync } from '../game/useClockSync'
import { useSongAssets } from '../game/useSongAssets'
import ReadyPanel from '../room/ReadyPanel'
import ResultsView, { type UploadState } from '../room/ResultsView'
import SingView from '../room/SingView'
import SongPicker from '../room/SongPicker'
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
  const { state, send, subscribe } = useRoomSocket(code)
  const { clock } = useClockSync(state.status === 'open', send, subscribe)
  const roomInfo = useRoomInfo(code)
  const joinUrl = roomInfo.data?.join_url ?? `${location.origin}/join/${code}`

  const [engine, setEngine] = useState<AudioEngine | null>(null)
  useEffect(() => () => engine?.close(), [engine])
  const [latency, setLatency] = useState<number | null>(savedLatency)
  const assets = useSongAssets(code, state.room?.song ?? null, engine)
  // Upload status of my recording, per performance.
  const [upload, setUpload] = useState<{ id: string; state: UploadState } | null>(null)
  const onUpload = useCallback((id: string, pending: Promise<void>) => {
    setUpload({ id, state: 'uploading' })
    pending.then(() => setUpload({ id, state: 'done' })).catch(() => setUpload({ id, state: 'failed' }))
  }, [])

  const room = state.room
  const players = room?.players ?? []
  const me = players.find((p) => p.id === user.id)
  const performanceId = room?.performance_id

  // Back from a reload without a mic: not ready to sing any more.
  useEffect(() => {
    if (me?.ready && !engine) send({ type: 'set_ready', ready: false })
  }, [me?.ready, engine, send])
  const uploadState: UploadState = upload && upload.id === performanceId ? upload.state : 'idle'

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

  if (room && (room.phase === 'countdown' || room.phase === 'playing')) {
    return (
      <SingView
        room={room}
        me={user.id}
        engine={engine}
        clock={clock}
        chart={assets.chart}
        buffer={assets.buffer}
        latencyMs={latency ?? 0}
        send={send}
        onUpload={onUpload}
      />
    )
  }

  const iAmHost = room?.host_id === user.id
  const anyoneReady = players.some((p) => p.ready && p.connected)
  const song = room?.song ?? null

  return (
    <div className="stack">
      {room?.phase === 'results' && (
        <ResultsView room={room} isHost={iAmHost} upload={uploadState} onNext={() => send({ type: 'back_to_lobby' })} />
      )}

      <div className="lobby">
        <section className="card invite">
          <p className="eyebrow">{t('lobby.code')}</p>
          <p className="room-code">{formatCode(code)}</p>
          <QrCode text={joinUrl} label={t('lobby.scanToJoin')} />
          <p className="muted small">{t('lobby.scanToJoin')}</p>
          <CopyLink url={joinUrl} />
        </section>

        <div className="stack">
          <section className="card stack">
            {state.status !== 'open' && (
              <p className="banner">{state.status === 'connecting' ? t('lobby.connecting') : t('lobby.reconnecting')}</p>
            )}
            <h2>{t('lobby.players', { count: players.length, capacity: room?.capacity ?? '–' })}</h2>
            <ul className="players">
              {players.map((p, index) => (
                <PlayerRow
                  key={p.id}
                  player={p}
                  color={playerColor(index)}
                  isMe={p.id === user.id}
                  canKick={iAmHost && p.id !== user.id}
                  onKick={() => {
                    if (confirm(t('lobby.confirmKick', { name: p.name }))) send({ type: 'kick', player_id: p.id })
                  }}
                />
              ))}
            </ul>
            {state.lastError && <ErrorText error={state.lastError} />}
          </section>

          <section className="card stack">
            <ReadyPanel
              engine={engine}
              onEngine={setEngine}
              latency={latency}
              onLatency={setLatency}
              ready={!!me?.ready}
              onReady={(ready) => send({ type: 'set_ready', ready })}
            />
          </section>

          <section className="card stack">
            <span className="eyebrow">{t('game.song.next')}</span>
            {song ? (
              <div className="chosen-song">
                <div className="pick-main">
                  <strong>{song.title}</strong>
                  <span className="muted small">{song.artist}</span>
                </div>
                <span className={`small ${assets.failed ? 'error' : 'muted'}`}>
                  {assets.failed
                    ? t('game.song.loadFailed')
                    : engine
                      ? assets.buffer && assets.chart
                        ? `✓ ${t('game.song.loaded')}`
                        : t('game.song.loading')
                      : ''}
                </span>
              </div>
            ) : (
              <p className="muted">{iAmHost ? t('game.song.noneHost') : t('game.song.none')}</p>
            )}

            {iAmHost ? (
              <>
                <button className="button primary big" disabled={!song || !anyoneReady} onClick={() => send({ type: 'start' })}>
                  {t('game.start.button')}
                </button>
                {(!song || !anyoneReady) && (
                  <p className="muted small">{!song ? t('game.start.needSong') : t('game.start.needReady')}</p>
                )}
                <details className="picker" open={!song}>
                  <summary>{t('game.song.pick')}</summary>
                  <SongPicker code={code} selectedId={song?.id ?? null} onPick={(id) => send({ type: 'select_song', song_id: id })} />
                </details>
              </>
            ) : (
              <p className="muted small">{t('game.start.waiting')}</p>
            )}
          </section>

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
        </div>
      </div>
    </div>
  )
}

function PlayerRow(props: { player: LobbyPlayer; color: string; isMe: boolean; canKick: boolean; onKick: () => void }) {
  const { t } = useTranslation()
  const { player } = props
  return (
    <li className={`player ${player.connected ? '' : 'away'}`}>
      <span className="avatar" style={{ background: props.color }} aria-hidden>
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
