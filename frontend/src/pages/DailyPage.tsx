import { CalendarDays, Crown, Dumbbell, Hourglass, LogIn, Mic, Trophy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useDaily } from '../api/hooks'
import type { DailyInfo } from '../api/types'
import ErrorText from '../components/ErrorText'
import { formatDuration, formatScore } from '../lib/format'
import { Badge, ButtonLink, Card, CountdownRing, EmptyState, Skeleton, SongCover, cx, formatTimeLeft, useNow } from '../ui'

const DAY_MS = 24 * 60 * 60 * 1000

/** The song of the day: one try per account, a leaderboard, and yesterday's winner. */
export default function DailyPage() {
  const { t } = useTranslation()
  const daily = useDaily()

  if (daily.isError) return <ErrorText error={daily.error} />
  if (!daily.data) return <DailySkeleton />
  const { leaderboard, yesterday } = daily.data

  return (
    <div className="daily-page">
      <DailyHero daily={daily.data} />

      <div className="daily-columns">
        <Card wide icon={Trophy} title={t('daily.leaderboard')} className="daily-board-card">
          {leaderboard.length === 0 ? (
            <EmptyState compact text={t('daily.nobodyYet')} />
          ) : (
            <>
              <ol className="daily-board">
                {leaderboard.map((row) => (
                  <BoardRow key={`${row.rank}-${row.name}`} row={row} />
                ))}
              </ol>
              <CheckLegend />
            </>
          )}
        </Card>

        <div className="daily-side">
          {yesterday && <Yesterday yesterday={yesterday} />}
          <Card wide icon={CalendarDays} title={t('daily.howTitle')} className="daily-how">
            <ul className="daily-how-list">
              <li>{t('daily.howOne')}</li>
              <li>{t('daily.howBoard')}</li>
              <li>{t('daily.howNext')}</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}

/** Today's song, the countdown to the next one, and my try (or the button to sing it). */
function DailyHero({ daily }: { daily: DailyInfo }) {
  const { t, i18n } = useTranslation()
  const { song, my_attempt: mine, can_compete: canCompete } = daily

  return (
    <section className="daily-hero" aria-labelledby="daily-title">
      <div className="daily-hero-song">
        {song && <SongCover song={song} size={112} className="daily-cover" />}
        <div className="daily-hero-titles">
          <span className="eyebrow daily-eyebrow">
            <CalendarDays size={14} aria-hidden />
            {t('daily.title')}
          </span>
          {song ? (
            <>
              <h1 id="daily-title">{song.title}</h1>
              {song.artist && <p className="daily-artist">{song.artist}</p>}
              {song.duration_seconds != null && <span className="tag daily-length">{formatDuration(song.duration_seconds)}</span>}
            </>
          ) : (
            <>
              <h1 id="daily-title" className="sr-only">{t('daily.title')}</h1>
              <p>{t('daily.noSong')}</p>
            </>
          )}
        </div>
        <NextSong at={daily.next_song_at} />
      </div>

      {song && (
        <div className="daily-hero-action">
          {mine ? (
            <div className="daily-mine">
              <Trophy size={22} aria-hidden className="daily-mine-icon" />
              <div className="stack tight">
                <p className="daily-mine-text">
                  {mine.check === 'no_recording'
                    ? t('daily.noRecording')
                    : mine.score != null
                      ? t('daily.yourScore', { score: formatScore(mine.score, i18n.language), rank: mine.rank })
                      : t('daily.unfinished')}
                </p>
                {mine.check === 'adjusted' && mine.claimed != null && (
                  <p className="small daily-mine-note">{t('daily.adjustedNote', { claimed: formatScore(mine.claimed, i18n.language) })}</p>
                )}
                {mine.score != null && mine.check !== 'no_recording' && (
                  <span>
                    <CheckBadge check={mine.check} />
                  </span>
                )}
              </div>
            </div>
          ) : canCompete ? (
            <>
              <ButtonLink variant="primary" size="lg" icon={Mic} to={`/solo/${song.id}?daily=1`}>
                {t('daily.singIt')}
              </ButtonLink>
              <p className="small daily-hint">{t('daily.oneShot')}</p>
            </>
          ) : (
            <>
              <div className="daily-hero-buttons">
                <ButtonLink variant="primary" size="lg" icon={LogIn} to="/sign-in?next=/daily">
                  {t('daily.signInToCompete')}
                </ButtonLink>
                <ButtonLink size="lg" icon={Dumbbell} to={`/solo/${song.id}?daily=1`}>
                  {t('daily.practice')}
                </ButtonLink>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}

// Its own component so only the ring re-renders every second.
function NextSong({ at }: { at: string }) {
  const { t } = useTranslation()
  const now = useNow(1000)
  const left = Math.max(0, Date.parse(at) - now)
  const time = formatTimeLeft(left)
  return (
    <div className="daily-next">
      <CountdownRing left={left} total={DAY_MS} size={92}>
        <span className="daily-next-time">{time}</span>
      </CountdownRing>
      <span className="daily-next-label">
        {t('daily.nextLabel')}
        <span className="sr-only"> {time}</span>
      </span>
    </div>
  )
}

function BoardRow({ row }: { row: DailyInfo['leaderboard'][number] }) {
  const { t, i18n } = useTranslation()
  const medal = row.rank <= 3 ? row.rank : null
  return (
    <li className={cx('daily-row', medal ? `medal-${medal}` : null, row.is_me && 'me')}>
      <span className={cx('daily-place', medal ? `medal-${medal}` : null)}>
        {medal ? (
          <>
            <span className="sr-only">{t('daily.place', { rank: row.rank })}</span>
            <span aria-hidden>{row.rank}</span>
          </>
        ) : (
          row.rank
        )}
      </span>
      <span className="daily-name">
        {row.name}
        {row.is_me && <Badge tone="violet">{t('lobby.you')}</Badge>}
      </span>
      <b className="daily-score">{formatScore(row.score, i18n.language)}</b>
      <span className="daily-check">
        <CheckBadge check={row.check} />
      </span>
    </li>
  )
}

/** Whether the server has re-scored this try from its recording: a small badge, explained on hover and to screen readers. */
function CheckBadge({ check }: { check: string }) {
  const { t } = useTranslation()
  if (check === 'verified') {
    return (
      <Badge tone="ok" title={t('daily.checks.verified')} className="check-badge">
        <span aria-hidden>✓</span>
        <span className="sr-only">{t('daily.checks.verified')}</span>
      </Badge>
    )
  }
  if (check === 'adjusted') {
    return (
      <Badge tone="warn" title={t('daily.checks.adjusted')} className="check-badge">
        <span aria-hidden>✓*</span>
        <span className="sr-only">{t('daily.checks.adjusted')}</span>
      </Badge>
    )
  }
  if (check === 'pending') {
    return (
      <Badge tone="neutral" icon={Hourglass} title={t('daily.checks.pendingLong')} className="check-badge">
        {t('daily.checks.pending')}
      </Badge>
    )
  }
  return null
}

function CheckLegend() {
  const { t } = useTranslation()
  return (
    <div className="daily-legend small">
      <p className="muted">{t('daily.checksIntro')}</p>
      <ul>
        <li>
          <CheckBadge check="verified" /> <span className="muted">{t('daily.checks.verified')}</span>
        </li>
        <li>
          <CheckBadge check="adjusted" /> <span className="muted">{t('daily.checks.adjusted')}</span>
        </li>
      </ul>
    </div>
  )
}

function Yesterday({ yesterday }: { yesterday: NonNullable<DailyInfo['yesterday']> }) {
  const { t, i18n } = useTranslation()
  return (
    <Card wide icon={Crown} eyebrow={t('daily.yesterdayTitle')} title={yesterday.name} className="daily-yesterday">
      <p className="daily-yesterday-score">
        <b>{formatScore(yesterday.score, i18n.language)}</b> <span className="muted small">{t('game.sing.points')}</span>
      </p>
      <p className="muted small">{t('daily.yesterdaySong', { title: yesterday.song_title })}</p>
    </Card>
  )
}

function DailySkeleton() {
  return (
    <div className="daily-page" aria-busy="true">
      <Skeleton height={260} radius="var(--r-card)" />
      <div className="daily-columns">
        <Skeleton height={320} radius="var(--r-card)" />
        <Skeleton height={200} radius="var(--r-card)" />
      </div>
    </div>
  )
}
