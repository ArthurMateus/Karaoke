import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router'
import { api } from '../api/client'
import { useMe, usePlayAsGuest, useSoloBests, useSongs } from '../api/hooks'
import type { Locale, Song, SoloResult } from '../api/types'
import { savedLatency } from '../audio/calibration'
import type { AudioEngine } from '../audio/engine'
import ErrorText from '../components/ErrorText'
import { ClockSync, wallNow } from '../game/clock'
import { useSongAssets } from '../game/useSongAssets'
import { formatDuration, formatScore } from '../lib/format'
import type { ClientMessage, LobbyRoom } from '../room/protocol'
import ReadyPanel from '../room/ReadyPanel'
import { ReplayPanel, type UploadState } from '../room/ResultsView'
import SingView from '../room/SingView'

const COUNTDOWN_MS = 4000
const noSubscribe = () => () => undefined

/** Singing alone: pick any song you may sing, with your best score on each. */
export default function SoloPage() {
  const { t, i18n } = useTranslation()
  const me = useMe()
  const songs = useSongs()
  const user = me.data?.user
  const bests = useSoloBests(!!user)

  if (me.isPending || !songs.data) return null
  if (!user) return <GuestName />
  const list = [...songs.data.mine.filter((s) => s.status === 'ready'), ...songs.data.starter]

  return (
    <section className="card stack">
      <h1>{t('solo.title')}</h1>
      <p className="muted">{t('solo.intro')}</p>
      <ul className="pick-list">
        {list.map((song) => {
          const best = bests.data?.[song.id]
          return (
            <li key={song.id} className="pick">
              <div className="pick-main">
                <strong>{song.title}</strong>
                <span className="muted small">{song.artist}</span>
              </div>
              <span className="tags">
                {song.duration_seconds != null && <span className="tag">{formatDuration(song.duration_seconds)}</span>}
                {best != null && <span className="tag ok">{t('solo.best', { score: formatScore(best, i18n.language) })}</span>}
              </span>
              <Link className="button small primary" to={`/solo/${song.id}`}>
                {t('solo.sing')}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** No identity yet: a name is enough to sing alone (sign in to keep scores and compete). */
function GuestName() {
  const { t, i18n } = useTranslation()
  const guest = usePlayAsGuest()
  const [name, setName] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    guest.mutate({ display_name: name, locale: i18n.language as Locale })
  }
  return (
    <section className="card stack">
      <h1>{t('solo.title')}</h1>
      <form className="stack" onSubmit={submit}>
        <label htmlFor="solo-name">{t('solo.yourName')}</label>
        <input id="solo-name" className="input" maxLength={40} required value={name} onChange={(e) => setName(e.target.value)} />
        <button className="button primary" type="submit" disabled={guest.isPending}>
          {t('solo.continue')}
        </button>
      </form>
      <p className="muted small">
        <Link to="/sign-in?next=/solo">{t('nav.signIn')}</Link> {t('solo.signInWhy')}
      </p>
      <ErrorText error={guest.error} />
    </section>
  )
}

type Stage =
  | { kind: 'setup' }
  | { kind: 'singing'; performanceId: string; startAt: number; counts: boolean }
  | { kind: 'done'; performanceId: string; result: SoloResult | null; counts: boolean }

/** One solo run: mic and delay check, the song, then the score and the replay. ?daily=1 = song of the day. */
export function SoloSingPage() {
  const { t, i18n } = useTranslation()
  const { songId = '' } = useParams()
  const [params] = useSearchParams()
  const isDaily = params.get('daily') === '1'
  const me = useMe()
  const songs = useSongs()
  const queryClient = useQueryClient()
  const user = me.data?.user
  const song = useMemo(
    () => [...(songs.data?.mine ?? []), ...(songs.data?.starter ?? [])].find((s) => s.id === songId) ?? null,
    [songs.data, songId],
  )
  const roomSong = useMemo(() => (song ? toRoomSong(song) : null), [song])

  const [engine, setEngine] = useState<AudioEngine | null>(null)
  useEffect(() => () => engine?.close(), [engine])
  const [latency, setLatency] = useState<number | null>(savedLatency)
  const assets = useSongAssets('', roomSong, engine)
  const [clock] = useState(() => new ClockSync()) // no server: this device's clock is the reference
  const [stage, setStage] = useState<Stage>({ kind: 'setup' })
  const [upload, setUpload] = useState<UploadState>('idle')
  const [error, setError] = useState<unknown>(null)

  const begin = async () => {
    setError(null)
    const startAt = wallNow() + COUNTDOWN_MS
    try {
      const started = await api<{ performance_id: string; counts: boolean }>('/api/solo', {
        body: { song_id: songId, daily: isDaily, start_at_ms: Math.round(startAt) },
      })
      setStage({ kind: 'singing', performanceId: started.performance_id, startAt, counts: started.counts })
    } catch (err) {
      setError(err)
    }
  }

  // SingView talks as if it were in a room; here only the end of the song matters.
  const send = useCallback(
    (message: ClientMessage) => {
      if (message.type !== 'finished' || stage.kind !== 'singing') return
      const { performanceId, counts } = stage
      setStage({ kind: 'done', performanceId, result: null, counts })
      api<SoloResult>(`/api/solo/${performanceId}/finish`, { body: { score: message.total } })
        .then((result) => {
          setStage({ kind: 'done', performanceId, result, counts })
          void queryClient.invalidateQueries({ queryKey: ['solo-bests'] })
          void queryClient.invalidateQueries({ queryKey: ['daily'] })
        })
        .catch(setError)
    },
    [stage, queryClient],
  )
  const onUpload = useCallback((_: string, pending: Promise<void>) => {
    setUpload('uploading')
    pending.then(() => setUpload('done')).catch(() => setUpload('failed'))
  }, [])

  if (me.isPending || !songs.data) return null
  if (!user) return <GuestName />
  if (!song || !roomSong) return <ErrorText error="song_not_found" />

  if (stage.kind === 'singing') {
    const room: LobbyRoom = {
      code: '',
      host_id: user.id,
      capacity: 1,
      phase: 'playing',
      players: [{ id: user.id, name: user.display_name, is_guest: user.is_guest, is_host: true, connected: true, ready: true }],
      song: roomSong,
      performance_id: stage.performanceId,
      start_at: stage.startAt,
      parts: { [user.id]: 'P1' },
      scores: { [user.id]: 0 },
      mode: 'sing_together',
      queue: [],
      votes: null,
      standings: [],
      stage_connected: false,
    }
    return (
      <SingView room={room} me={user.id} engine={engine} player={engine} onNeedPlayer={() => undefined} clock={clock}
        chart={assets.chart} buffer={assets.buffer} latencyMs={latency ?? 0} send={send} subscribe={noSubscribe}
        onUpload={onUpload} musicHere onMusicHere={() => undefined} fromAfar={false} onFromAfar={() => undefined} />
    )
  }

  if (stage.kind === 'done') {
    const { result } = stage
    return (
      <section className="card wide results">
        <div>
          <span className="eyebrow">{isDaily ? t('daily.title') : t('solo.title')}</span>
          <h2>{song.title}</h2>
        </div>
        {result ? (
          <div className="solo-score">
            <b>{t('game.results.points', { score: formatScore(result.score, i18n.language) })}</b>
            {result.new_best ? (
              <span className="tag ok">{t('solo.newBest')}</span>
            ) : (
              <span className="muted">{t('solo.best', { score: formatScore(result.best, i18n.language) })}</span>
            )}
            {result.daily_rank != null && <span className="tag host">{t('daily.yourRank', { rank: result.daily_rank })}</span>}
          </div>
        ) : (
          <p className="muted">{t('solo.saving')}</p>
        )}
        {isDaily && !stage.counts && <p className="muted small">{t('daily.practiceNote')}</p>}
        <div className="row wrap">
          {isDaily ? (
            <Link className="button primary" to="/daily">
              {t('daily.seeBoard')}
            </Link>
          ) : (
            <button className="button primary" onClick={() => {
              setUpload('idle')
              setStage({ kind: 'setup' })
            }}>
              {t('solo.again')}
            </button>
          )}
          <Link className="button" to="/solo">
            {t('solo.otherSong')}
          </Link>
        </div>
        <ReplayPanel performanceId={stage.performanceId} upload={upload} title={t('solo.replay')} />
        <ErrorText error={error} />
      </section>
    )
  }

  const loaded = !!assets.chart && !!assets.buffer
  return (
    <div className="stack">
      <section className="card stack">
        <span className="eyebrow">{isDaily ? t('daily.title') : t('solo.title')}</span>
        <h1>{song.title}</h1>
        <p className="muted">{song.artist}</p>
        {isDaily && user.is_guest && <p className="banner small">{t('daily.guestPractice')}</p>}
        {isDaily && !user.is_guest && <p className="banner small">{t('daily.oneShotWarning')}</p>}
      </section>
      <section className="card stack">
        <ReadyPanel engine={engine} onEngine={setEngine} latency={latency} onLatency={setLatency} ready={false}
          readyLabel={loaded ? (isDaily && !user.is_guest ? t('daily.go') : t('solo.start')) : t('game.song.loading')}
          onReady={() => (loaded ? void begin() : undefined)} />
        {engine && !loaded && !assets.failed && <p className="muted small">{t('game.song.loading')}</p>}
        {assets.failed && <p className="error small">{t('game.song.loadFailed')}</p>}
        <ErrorText error={error} />
      </section>
    </div>
  )
}

function toRoomSong(song: Song) {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    duration_seconds: song.duration_seconds ?? 0,
    is_duet: song.is_duet,
  }
}
