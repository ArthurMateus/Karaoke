import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { playerColor } from '../lib/colors'
import { formatScore } from '../lib/format'
import type { LobbyRoom } from './protocol'

interface PerformanceInfo {
  id: string
  song_title: string
  replay_status: 'waiting' | 'mixing' | 'ready' | 'failed' | 'no_recordings' | 'not_included'
  singers: { id: string; name: string; part: string; score: number; has_recording: boolean }[]
}

export type UploadState = 'idle' | 'uploading' | 'done' | 'failed'

/** A performance and its replay status, polled until the worker is done mixing. */
function usePerformance(performanceId: string | null) {
  return useQuery({
    queryKey: ['performance', performanceId],
    queryFn: () => api<PerformanceInfo>(`/api/performances/${performanceId}`),
    enabled: !!performanceId,
    refetchInterval: (query) => {
      const status = query.state.data?.replay_status
      return status === 'ready' || status === 'failed' || status === 'no_recordings' || status === 'not_included' ? false : 3000
    },
    retry: false,
  })
}

/** Final scores, and the group replay once the worker has mixed it. */
export default function ResultsView({ room, isHost, upload, onNext }: { room: LobbyRoom; isHost: boolean; upload: UploadState; onNext: () => void }) {
  const { t, i18n } = useTranslation()
  const order = room.players.map((p) => p.id)
  const performance = usePerformance(room.performance_id)

  const ranking = Object.entries(room.scores)
    .map(([id, score]) => ({ id, score, name: room.players.find((p) => p.id === id)?.name ?? performance.data?.singers.find((s) => s.id === id)?.name ?? '…' }))
    .sort((a, b) => b.score - a.score)

  return (
    <section className="card wide results">
      <div className="row spread wrap">
        <div>
          <span className="eyebrow">{t('game.results.title')}</span>
          <h2>{room.song?.title}</h2>
        </div>
        {isHost ? (
          <button className="button primary" onClick={onNext}>
            {t('game.results.again')}
          </button>
        ) : (
          <span className="muted small">{t('game.results.waitingHost')}</span>
        )}
      </div>

      <ol className="ranking">
        {ranking.map((entry, i) => (
          <li key={entry.id} className={`rank ${i === 0 ? 'first' : ''}`}>
            <span className="rank-place">{i + 1}</span>
            <span className="avatar" style={{ background: playerColor(order.indexOf(entry.id)) }} aria-hidden>
              {entry.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="player-name">{entry.name}</span>
            <b className="rank-score">{t('game.results.points', { score: formatScore(entry.score, i18n.language) })}</b>
          </li>
        ))}
      </ol>

      <ReplayPanel performanceId={room.performance_id} upload={upload} />
    </section>
  )
}

/** The group replay: a spinner while the worker mixes, then a player. */
export function ReplayPanel({ performanceId, upload, title }: { performanceId: string | null; upload: UploadState; title?: string }) {
  const { t } = useTranslation()
  const status = usePerformance(performanceId).data?.replay_status
  return (
    <div className="replay">
      <h3>{title ?? t('game.results.replay')}</h3>
      {upload === 'uploading' && <p className="muted small">{t('game.results.uploading')}</p>}
      {upload === 'failed' && <p className="error small">{t('game.results.uploadFailed')}</p>}
      {status === 'ready' ? (
        <audio className="replay-player" controls preload="metadata" src={`/api/performances/${performanceId}/replay`} />
      ) : status === 'failed' ? (
        <p className="error small">{t('game.results.replayFailed')}</p>
      ) : status === 'not_included' ? (
        <p className="muted small">{t('plan.replaysNotIncluded')}</p>
      ) : status === 'no_recordings' ? (
        <p className="muted small">{t('game.results.replayNone')}</p>
      ) : (
        <div className="row small muted">
          <span className="spinner" aria-hidden />
          {t('game.results.replayWaiting')}
        </div>
      )}
    </div>
  )
}
