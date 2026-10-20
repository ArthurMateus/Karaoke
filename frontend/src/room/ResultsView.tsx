import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Hourglass, PartyPopper, Trophy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { useMe } from '../api/hooks'
import { playerColor } from '../lib/colors'
import { formatScore } from '../lib/format'
import { Badge, Button, SongCover, useCountUp } from '../ui'
import { ReplayPlayer } from '../ui/ReplayPlayer'
import { useCelebrate } from './celebrate'
import { Podium, RankList } from './Podium'
import { placeAll } from './ranking'
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

/** Final scores on a podium, and the group replay once the worker has mixed it. */
export default function ResultsView({ room, isHost, upload, onNext, me: meProp }: {
  room: LobbyRoom
  isHost: boolean
  upload: UploadState
  onNext: () => void
  me?: string
}) {
  const { t } = useTranslation()
  const signedIn = useMe().data?.user?.id
  const me = meProp ?? signedIn ?? ''
  const order = room.players.map((p) => p.id)
  const performance = usePerformance(room.performance_id)

  const ranking = placeAll(
    Object.entries(room.scores).map(([id, score]) => ({
      id,
      score,
      name: room.players.find((p) => p.id === id)?.name ?? performance.data?.singers.find((s) => s.id === id)?.name ?? '…',
      color: playerColor(Math.max(0, order.indexOf(id))),
    })),
  )
  const winner = ranking[0]
  const winners = ranking.filter((r) => r.place === 1)
  const iWon = winners.some((r) => r.id === me)
  useCelebrate(room.performance_id, !!winner && winner.score > 0)

  return (
    <section className="card wide results sing-results">
      <header className="results-head">
        {room.song && <SongCover song={room.song} size={56} />}
        <div className="results-titles">
          <span className="eyebrow">{t('game.results.title')}</span>
          <h2>{room.song?.title}</h2>
          {room.song?.artist && <p className="muted small">{room.song.artist}</p>}
        </div>
        <div className="results-actions">
          {isHost ? (
            <Button variant="primary" iconRight={ArrowRight} onClick={onNext}>
              {t('game.results.again')}
            </Button>
          ) : (
            <span className="muted small results-wait">
              <Hourglass size={16} aria-hidden />
              {t('game.results.waitingHost')}
            </span>
          )}
        </div>
      </header>

      {winner && winner.score > 0 && ranking.length > 1 && (
        <p className="results-winner" aria-live="polite">
          {iWon ? <PartyPopper size={20} aria-hidden /> : <Trophy size={20} aria-hidden />}
          {winners.length > 1
            ? t('game.results.tie', { names: winners.map((w) => w.name).join(' & ') })
            : iWon
              ? t('game.results.youWon')
              : t('game.results.winner', { name: winner.name })}
        </p>
      )}

      <div className="results-body">
        <div className="results-board">
          <Podium top={ranking.slice(0, 3)} me={me} />
          <RankList rest={ranking.slice(3)} me={me} />
        </div>
        <ReplayPanel performanceId={room.performance_id} upload={upload} />
      </div>
    </section>
  )
}

/** A solo run's score counting up, with a celebration for a new personal best.
 * For the solo results (pages/SoloPage.tsx): `best` is the best before or including this run, as the API gives it. */
export function SoloScore({ performanceId, score, best, newBest }: { performanceId: string; score: number; best: number; newBest: boolean }) {
  const { t, i18n } = useTranslation()
  const shown = useCountUp(score, 1400)
  useCelebrate(newBest ? `solo-${performanceId}` : null, newBest && score > 0)
  return (
    <div className={newBest ? 'solo-result new-best' : 'solo-result'}>
      <b className="solo-result-score">
        <span aria-hidden>{formatScore(shown, i18n.language)}</span>
        <span className="sr-only">{t('game.results.points', { score: formatScore(score, i18n.language) })}</span>
      </b>
      <span className="solo-result-label">{t('game.sing.points')}</span>
      {newBest ? (
        <Badge tone="premium" icon={Trophy}>
          {t('solo.newBest')}
        </Badge>
      ) : (
        <span className="muted">{t('solo.best', { score: formatScore(best, i18n.language) })}</span>
      )}
    </div>
  )
}

/** The group replay: a spinner while the worker mixes, then a player. */
export function ReplayPanel({ performanceId, upload, title }: { performanceId: string | null; upload: UploadState; title?: string }) {
  const { t } = useTranslation()
  const status = usePerformance(performanceId).data?.replay_status
  const heading = title ?? t('game.results.replay')
  return (
    <div className="replay">
      <h3>{heading}</h3>
      {upload === 'uploading' && (
        <p className="muted small replay-note">
          <span className="spinner" aria-hidden />
          {t('game.results.uploading')}
        </p>
      )}
      {upload === 'failed' && <p className="error small">{t('game.results.uploadFailed')}</p>}
      {status === 'ready' ? (
        <ReplayPlayer src={`/api/performances/${performanceId}/replay`} label={heading} />
      ) : status === 'failed' ? (
        <p className="error small">{t('game.results.replayFailed')}</p>
      ) : status === 'not_included' ? (
        <p className="muted small">{t('plan.replaysNotIncluded')}</p>
      ) : status === 'no_recordings' ? (
        <p className="muted small">{t('game.results.replayNone')}</p>
      ) : (
        <div className="replay-player waiting" aria-live="polite">
          <span className="replay-toggle" aria-hidden>
            <span className="spinner" />
          </span>
          <span className="small muted">{t('game.results.replayWaiting')}</span>
        </div>
      )}
    </div>
  )
}
