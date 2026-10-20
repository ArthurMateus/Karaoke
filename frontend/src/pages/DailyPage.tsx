import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useDaily } from '../api/hooks'
import ErrorText from '../components/ErrorText'
import { formatScore } from '../lib/format'

/** The song of the day: one try per account, a leaderboard, and yesterday's winner. */
export default function DailyPage() {
  const { t, i18n } = useTranslation()
  const daily = useDaily()
  const left = useTimeLeft(daily.data?.next_song_at ?? null)

  if (daily.isError) return <ErrorText error={daily.error} />
  if (!daily.data) return null
  const { song, my_attempt: mine, leaderboard, yesterday, can_compete: canCompete } = daily.data

  return (
    <div className="stack">
      <section className="card stack daily-hero">
        <span className="eyebrow">{t('daily.title')}</span>
        {song ? (
          <>
            <h1>{song.title}</h1>
            <p className="muted">{song.artist}</p>
          </>
        ) : (
          <p className="muted">{t('daily.noSong')}</p>
        )}
        <p className="muted small">{t('daily.nextIn', { time: left })}</p>

        {song &&
          (mine ? (
            <p className="daily-mine">
              {mine.score != null
                ? t('daily.yourScore', { score: formatScore(mine.score, i18n.language), rank: mine.rank })
                : t('daily.unfinished')}
            </p>
          ) : canCompete ? (
            <>
              <Link className="button primary big" to={`/solo/${song.id}?daily=1`}>
                {t('daily.singIt')}
              </Link>
              <p className="muted small">{t('daily.oneShot')}</p>
            </>
          ) : (
            <>
              <Link className="button primary big" to="/sign-in?next=/daily">
                {t('daily.signInToCompete')}
              </Link>
              <Link className="button" to={`/solo/${song.id}?daily=1`}>
                {t('daily.practice')}
              </Link>
            </>
          ))}
      </section>

      <section className="card stack">
        <span className="eyebrow">{t('daily.leaderboard')}</span>
        {leaderboard.length === 0 ? (
          <p className="muted">{t('daily.nobodyYet')}</p>
        ) : (
          <ol className="ranking">
            {leaderboard.map((row) => (
              <li key={`${row.rank}-${row.name}`} className={`rank ${row.rank === 1 ? 'first' : ''} ${row.is_me ? 'me' : ''}`}>
                <span className="rank-place">{row.rank}</span>
                <span className="player-name">
                  {row.name}
                  {row.is_me && <span className="muted"> ({t('lobby.you')})</span>}
                </span>
                <b className="rank-score">{t('game.results.points', { score: formatScore(row.score, i18n.language) })}</b>
              </li>
            ))}
          </ol>
        )}
        {yesterday && (
          <p className="muted small">
            {t('daily.yesterday', { name: yesterday.name, score: formatScore(yesterday.score, i18n.language), title: yesterday.song_title })}
          </p>
        )}
      </section>
    </div>
  )
}

/** "5 h 12 min" until `iso`, updated every minute. */
function useTimeLeft(iso: string | null): string {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  if (!iso) return ''
  const minutes = Math.max(0, Math.round((new Date(iso).getTime() - now) / 60_000))
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}
