import { Check, ChevronDown, DoorClosed, ExternalLink, House, LogOut, Mic, Play, RotateCcw, Sparkles, Tv } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useParams } from 'react-router'
import { api } from '../api/client'
import { useMe, useRoomInfo } from '../api/hooks'
import type { User } from '../api/types'
import ErrorText from '../components/ErrorText'
import QrCode from '../components/QrCode'
import { normalizeCode } from '../lib/roomCode'
import { savedLatency } from '../audio/calibration'
import { AudioEngine } from '../audio/engine'
import { useClockSync } from '../game/useClockSync'
import { useSongAssets } from '../game/useSongAssets'
import InvitePanel from '../room/InvitePanel'
import ModePicker from '../room/ModePicker'
import PlayerGrid from '../room/PlayerGrid'
import ReadyPanel from '../room/ReadyPanel'
import ResultsView, { type UploadState } from '../room/ResultsView'
import SingView from '../room/SingView'
import SongPanel, { type SongLoad } from '../room/SongPanel'
import SpotlightLobby from '../room/SpotlightLobby'
import SpotlightResults from '../room/SpotlightResults'
import type { ClientMessage, LobbyPlayer, LobbyRoom } from '../room/protocol'
import { nextTurnBlockers } from '../room/turns'
import { useRoomSocket } from '../room/useRoomSocket'
import { Button, ButtonAnchor, ButtonLink, Card, EmptyState, useConfirm } from '../ui'

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
  const confirm = useConfirm()
  const { state, send, subscribe } = useRoomSocket(code)
  const { clock } = useClockSync(state.status === 'open', send, subscribe)
  const roomInfo = useRoomInfo(code)
  const joinUrl = roomInfo.data?.join_url ?? `${location.origin}/join/${code}`

  const [engine, setEngine] = useState<AudioEngine | null>(null)
  useEffect(() => () => engine?.close(), [engine])
  // Sound only (no mic), for someone who listens to Spotlight from afar without singing.
  const [speaker, setSpeaker] = useState<AudioEngine | null>(null)
  useEffect(() => () => speaker?.close(), [speaker])
  const player = engine ?? speaker
  const [latency, setLatency] = useState<number | null>(savedLatency)
  const assets = useSongAssets(code, state.room?.song ?? null, player)
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
  // While a stage screen plays the music, phones stay quiet unless switched on (e.g. for headphones).
  const [musicPref, setMusicPref] = useState(() => readMusicPref())
  const musicHere = !room?.stage_connected || musicPref
  const [fromAfar, setFromAfar] = useState(() => readPref(AFAR_KEY))

  if (state.status === 'ended') {
    return (
      <Card className="lobby-ended">
        <EmptyState
          title={t(`lobby.ended.${state.endReason}`)}
          action={
            <div className="row wrap center-row">
              {state.endReason === 'replaced' && (
                <Button icon={RotateCcw} onClick={() => location.reload()}>
                  {t('lobby.openHere')}
                </Button>
              )}
              <ButtonLink variant="primary" icon={House} to="/">
                {t('lobby.backHome')}
              </ButtonLink>
            </div>
          }
        />
      </Card>
    )
  }

  if (room && (room.phase === 'countdown' || room.phase === 'playing')) {
    return (
      <SingView
        room={room}
        me={user.id}
        engine={engine}
        player={player}
        onNeedPlayer={() => void AudioEngine.createPlayback().then(setSpeaker)}
        clock={clock}
        chart={assets.chart}
        buffer={assets.buffer}
        latencyMs={latency ?? 0}
        send={send}
        subscribe={subscribe}
        onUpload={onUpload}
        musicHere={musicHere}
        fromAfar={fromAfar}
        onFromAfar={(on) => {
          setFromAfar(on)
          writePref(AFAR_KEY, on)
        }}
        onMusicHere={(on) => {
          setMusicPref(on)
          writeMusicPref(on)
        }}
      />
    )
  }

  const iAmHost = room?.host_id === user.id
  const anyoneReady = players.some((p) => p.ready && p.connected)
  const song = room?.song ?? null
  const spotlight = room?.mode === 'spotlight'
  const songLoad: SongLoad = assets.failed ? 'failed' : !engine ? 'none' : assets.buffer && assets.chart ? 'loaded' : 'loading'

  const kick = async (p: LobbyPlayer) => {
    if (await confirm({ title: t('lobby.confirmKick', { name: p.name }), confirmLabel: t('lobby.kick'), danger: true })) {
      send({ type: 'kick', player_id: p.id })
    }
  }
  const closeRoom = async () => {
    if (await confirm({ title: t('lobby.confirmClose'), confirmLabel: t('lobby.closeRoom'), danger: true })) send({ type: 'close_room' })
  }

  return (
    <div className="lobby-page">
      {room?.phase === 'results' &&
        (spotlight ? (
          <SpotlightResults room={room} me={user.id} upload={uploadState} send={send} subscribe={subscribe} />
        ) : (
          <ResultsView room={room} isHost={iAmHost} upload={uploadState} onNext={() => send({ type: 'back_to_lobby' })} />
        ))}

      {state.status !== 'open' && (
        <p className="banner connection-banner" role="status">
          <span className="spinner" aria-hidden />
          {state.status === 'connecting' ? t('lobby.connecting') : t('lobby.reconnecting')}
        </p>
      )}

      <div className="lobby">
        <aside className="lobby-side">
          <InvitePanel code={code} joinUrl={joinUrl} room={room} isHost={iAmHost} />
          {iAmHost && <StageCard code={code} />}
        </aside>

        <div className="lobby-main">
          <PlayerGrid players={players} capacity={room?.capacity ?? null} me={user.id} isHost={iAmHost} onKick={kick} />
          {state.lastError && <ErrorText error={state.lastError} />}

          <section className="card stack wide" id="mic-panel">
            <ReadyPanel
              engine={engine}
              onEngine={setEngine}
              latency={latency}
              onLatency={setLatency}
              ready={!!me?.ready}
              onReady={(ready) => send({ type: 'set_ready', ready })}
              readyInBar
            />
          </section>

          {iAmHost && room && <ModePicker room={room} send={send} />}
          {!iAmHost && spotlight && (
            <p className="banner small with-icon">
              <Sparkles size={16} aria-hidden /> {t('modes.spotlightHelp')}
            </p>
          )}
          {room?.stage_connected && (
            <p className="banner small with-icon">
              <Tv size={16} aria-hidden /> {t('stage.connected')}
            </p>
          )}

          {spotlight && room ? (
            <SpotlightLobby room={room} me={user.id} send={send} />
          ) : (
            <SongPanel code={code} song={song} load={songLoad} isHost={iAmHost} anyoneReady={anyoneReady} send={send} />
          )}

          <div className="row end">
            {iAmHost ? (
              <Button variant="ghost" icon={DoorClosed} className="danger-text" onClick={closeRoom}>
                {t('lobby.closeRoom')}
              </Button>
            ) : (
              <Button variant="ghost" icon={LogOut} onClick={() => send({ type: 'leave' })}>
                {t('lobby.leave')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {room && (
        <ActionBar room={room} me={me ?? null} isHost={iAmHost} micReady={!!engine && latency !== null} anyoneReady={anyoneReady} send={send} />
      )}
    </div>
  )
}

/** Phones: the one thing to do next, in a bar at the bottom, where thumbs reach it. */
function ActionBar({ room, me, isHost, micReady, anyoneReady, send }: {
  room: LobbyRoom
  me: LobbyPlayer | null
  isHost: boolean
  micReady: boolean
  anyoneReady: boolean
  send: (message: ClientMessage) => void
}) {
  const { t } = useTranslation()
  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.name ?? '…'
  const ready = !!me?.ready
  const toggleReady = () => send({ type: 'set_ready', ready: !ready })
  const toMic = () => {
    const panel = document.getElementById('mic-panel')
    panel?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
    panel?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true })
  }

  let main: { label: string; icon: typeof Mic; onClick: () => void; disabled?: boolean } | null = null
  let hint: string | null = null
  if (!micReady) {
    main = { label: t('game.mic.setUp'), icon: Mic, onClick: toMic }
  } else if (isHost && room.mode === 'spotlight') {
    const next = room.queue[0]
    const blockers = nextTurnBlockers(room)
    const label = next ? t('spotlight.startTurn', { name: nameOf(next.singer_id) }) : t('spotlight.startTurnEmpty')
    if (next && blockers.length === 0) main = { label, icon: Play, onClick: () => send({ type: 'start' }) }
    else if (!ready) main = { label: t('game.ready.imReady'), icon: Check, onClick: toggleReady }
    else {
      main = { label, icon: Play, onClick: () => {}, disabled: true }
      hint = next ? t('spotlight.waitingFor', { names: blockers.map(nameOf).join(', ') }) : t('spotlight.queueEmpty')
    }
  } else if (isHost) {
    if (room.song && anyoneReady) main = { label: t('game.start.button'), icon: Play, onClick: () => send({ type: 'start' }) }
    else if (!ready) main = { label: t('game.ready.imReady'), icon: Check, onClick: toggleReady }
    else {
      main = { label: t('game.start.button'), icon: Play, onClick: () => {}, disabled: true }
      hint = t('game.start.needSong')
    }
  } else if (!ready) {
    main = { label: t('game.ready.imReady'), icon: Check, onClick: toggleReady }
  }

  // A ready player can always take it back (the panel's own button is hidden on phones).
  const showUnready = micReady && ready
  if (!main && !showUnready) return null
  return (
    <div className="action-bar">
      {hint && <p className="action-hint small">{hint}</p>}
      <div className="action-row">
        {showUnready && (
          <Button variant="secondary" onClick={toggleReady} block={!main}>
            {t('game.ready.notReady')}
          </Button>
        )}
        {main && (
          <Button variant="primary" size="lg" icon={main.icon} onClick={main.onClick} disabled={main.disabled} className="action-main">
            {main.label}
          </Button>
        )}
      </div>
    </div>
  )
}

const MUSIC_KEY = 'kp_music_on_phone'
const AFAR_KEY = 'kp_listen_from_afar'

const readMusicPref = () => readPref(MUSIC_KEY)
const writeMusicPref = (on: boolean) => writePref(MUSIC_KEY, on)

/** On/off choices remembered on this device. */
function readPref(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writePref(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? '1' : '0')
  } catch {
    // private mode: just for now
  }
}

/** The host's link for a stage screen: a TV or laptop that plays the music and shows the game. */
function StageCard({ code }: { code: string }) {
  const { t } = useTranslation()
  const [link, setLink] = useState<{ token: string; url: string } | null>(null)
  const [error, setError] = useState<unknown>(null)
  const load = async () => {
    try {
      setLink(await api<{ token: string; url: string }>(`/api/rooms/${code}/stage`))
    } catch (err) {
      setError(err)
    }
  }
  // This browser can open it at its own address; other devices use the network address in the QR code.
  const here = link ? `${location.origin}/stage/${code}?t=${encodeURIComponent(link.token)}` : ''
  return (
    <details className="card stack wide stage-card" onToggle={(e) => (e.currentTarget.open && !link ? void load() : undefined)}>
      <summary>
        <span className="card-icon" aria-hidden>
          <Tv size={18} />
        </span>
        <span className="stage-card-title">{t('stage.title')}</span>
        <ChevronDown size={18} aria-hidden className="stage-card-caret" />
      </summary>
      <p className="muted small">{t('stage.intro')}</p>
      {link && (
        <>
          <ButtonAnchor variant="primary" icon={ExternalLink} href={here} target="_blank" rel="noopener">
            {t('stage.openHere')}
          </ButtonAnchor>
          <div className="qr-tile small">
            <QrCode text={link.url} label={t('stage.scan')} />
          </div>
          <p className="muted small center">{t('stage.scan')}</p>
        </>
      )}
      <ErrorText error={error} />
    </details>
  )
}
