import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router'
import { api } from '../api/client'
import { useMe, usePlan, useRoomInfo, useStartPartyPass } from '../api/hooks'
import type { User } from '../api/types'
import ErrorText from '../components/ErrorText'
import QrCode from '../components/QrCode'
import { playerColor } from '../lib/colors'
import { formatCode, normalizeCode } from '../lib/roomCode'
import { savedLatency } from '../audio/calibration'
import { AudioEngine } from '../audio/engine'
import { useClockSync } from '../game/useClockSync'
import { useSongAssets } from '../game/useSongAssets'
import ReadyPanel from '../room/ReadyPanel'
import ResultsView, { type UploadState } from '../room/ResultsView'
import SingView from '../room/SingView'
import SongPicker from '../room/SongPicker'
import SpotlightLobby from '../room/SpotlightLobby'
import SpotlightResults from '../room/SpotlightResults'
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

  return (
    <div className="stack">
      {room?.phase === 'results' &&
        (spotlight ? (
          <SpotlightResults room={room} me={user.id} upload={uploadState} send={send} subscribe={subscribe} />
        ) : (
          <ResultsView room={room} isHost={iAmHost} upload={uploadState} onNext={() => send({ type: 'back_to_lobby' })} />
        ))}

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

          {iAmHost && room && (
            <section className="card stack">
              <span className="eyebrow">{t('modes.title')}</span>
              <div className="segmented" role="radiogroup" aria-label={t('modes.title')}>
                {(['sing_together', 'spotlight'] as const).map((mode) => {
                  const locked = !room.allowed_modes.includes(mode)
                  return (
                    <button key={mode} type="button" role="radio" aria-checked={room.mode === mode} disabled={locked}
                      className={room.mode === mode ? 'on' : ''} onClick={() => send({ type: 'set_mode', mode })}>
                      {t(`modes.${mode}`)}
                      {locked && ' 🔒'}
                    </button>
                  )
                })}
              </div>
              <p className="muted small">{t(`modes.${room.mode}Help`)}</p>
              {!room.allowed_modes.includes('spotlight') && <HostUpgrade />}
            </section>
          )}
          {!iAmHost && spotlight && <p className="banner small">{t('modes.spotlightHelp')}</p>}
          {room?.stage_connected && <p className="banner small">{t('stage.connected')}</p>}
          {iAmHost && <StageCard code={code} />}

          {spotlight && room ? (
            <SpotlightLobby room={room} me={user.id} send={send} />
          ) : (
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
                  <SongPicker code={code} selectedId={song?.id ?? null} isHost onPick={(picked) => send({ type: 'select_song', song_id: picked.id })} />
                </details>
              </>
            ) : (
              <p className="muted small">{t('game.start.waiting')}</p>
            )}
          </section>
          )}

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
    <details className="card stack stage-card" onToggle={(e) => (e.currentTarget.open && !link ? void load() : undefined)}>
      <summary>
        <span className="eyebrow">{t('stage.title')}</span>
      </summary>
      <p className="muted small">{t('stage.intro')}</p>
      {link && (
        <>
          <a className="button primary" href={here} target="_blank" rel="noopener">
            {t('stage.openHere')}
          </a>
          <QrCode text={link.url} label={t('stage.scan')} />
          <p className="muted small">{t('stage.scan')}</p>
        </>
      )}
      <ErrorText error={error} />
    </details>
  )
}

/** A free host's room: Spotlight, 16 players and replays need premium or a Party Pass. */
function HostUpgrade() {
  const { t } = useTranslation()
  const plan = usePlan(true)
  const startPass = useStartPartyPass()
  const passes = plan.data?.unused_passes ?? 0
  return (
    <div className="stack tight pass-box">
      <p className="small">{t('plan.lockedInRoom')}</p>
      {passes > 0 ? (
        <button className="button primary" disabled={startPass.isPending} onClick={() => startPass.mutate()}>
          {t('plan.startPassHere', { count: passes })}
        </button>
      ) : (
        <Link className="link-button small" to="/profile">
          {t('plan.getPremium')}
        </Link>
      )}
      <ErrorText error={startPass.error} />
    </div>
  )
}
