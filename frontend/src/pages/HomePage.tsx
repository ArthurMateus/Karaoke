import { ArrowRight, CalendarDays, LogIn, Mic, Plus, Sparkles, Timer, Trophy, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useCreateRoom, useDaily, useMe } from '../api/hooks'
import type { DailyInfo } from '../api/types'
import ErrorText from '../components/ErrorText'
import HeroLane from '../components/HeroLane'
import { formatScore } from '../lib/format'
import { normalizeCode } from '../lib/roomCode'
import { Badge, Button, ButtonLink, Card, Skeleton, SongCover, formatTimeLeft, useNow } from '../ui'

export default function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data } = useMe()
  const createRoom = useCreateRoom()
  const [code, setCode] = useState('')
  const [codeInvalid, setCodeInvalid] = useState(false)
  const canHost = !!data?.user && !data.user.is_guest

  const join = (e: FormEvent) => {
    e.preventDefault()
    const normalized = normalizeCode(code)
    setCodeInvalid(!normalized)
    if (normalized) navigate(`/join/${normalized}`)
  }

  return (
    <div className="home">
      <section className="hero" aria-labelledby="home-title">
        <div className="hero-text">
          <span className="eyebrow hero-eyebrow">
            <Mic size={14} aria-hidden />
            {t('home.eyebrow')}
          </span>
          <h1 id="home-title">
            <Trans i18nKey="home.headline" components={{ em: <em /> }} />
          </h1>
          <p className="hero-tagline">{t('app.tagline')}</p>

          <div className="hero-actions">
            <div className="hero-host">
              {canHost ? (
                <Button
                  variant="primary"
                  size="lg"
                  icon={Plus}
                  loading={createRoom.isPending}
                  onClick={() => createRoom.mutate(undefined, { onSuccess: (room) => navigate(`/room/${room.code}`) })}
                >
                  {createRoom.isPending ? t('home.creating') : t('home.createRoom')}
                </Button>
              ) : (
                <>
                  <ButtonLink variant="primary" size="lg" icon={LogIn} to="/sign-in">
                    {t('nav.signIn')}
                  </ButtonLink>
                  <p className="muted small">{t('home.signInToHost')}</p>
                </>
              )}
              <ErrorText error={createRoom.error} />
            </div>

            <form className="hero-join" onSubmit={join} noValidate>
              <label className="hero-join-label" htmlFor="room-code">
                {t('home.joinWithCode')}
              </label>
              <div className="hero-join-row">
                <input
                  id="room-code"
                  className="input code-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={t('home.codePlaceholder')}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={8}
                  aria-invalid={codeInvalid || undefined}
                  aria-describedby={codeInvalid ? 'room-code-error' : undefined}
                />
                <Button type="submit" size="lg" iconRight={ArrowRight}>
                  {t('home.join')}
                </Button>
              </div>
              {codeInvalid && (
                <p className="error small" id="room-code-error" role="alert">
                  {t('home.invalidCode')}
                </p>
              )}
            </form>
          </div>
        </div>
        <HeroLane />
      </section>

      <section className="home-tiles" aria-label={t('home.featuresLabel')}>
        <Card as="article" wide icon={Users} title={t('modes.sing_together')} className="home-tile">
          <p className="muted">{t('home.togetherText')}</p>
        </Card>
        <Card
          as="article"
          wide
          icon={Sparkles}
          title={t('modes.spotlight')}
          actions={<Badge tone="premium">{t('plan.premiumOrPass')}</Badge>}
          className="home-tile"
        >
          <p className="muted">{t('home.spotlightText')}</p>
        </Card>
        <Card as="article" wide icon={Mic} title={t('home.soloTitle')} className="home-tile">
          <p className="muted">{t('home.soloText')}</p>
          <ButtonLink to="/solo" block iconRight={ArrowRight} className="home-tile-action">
            {t('home.solo')}
          </ButtonLink>
        </Card>
        <DailyTile />
      </section>

      <HowItWorks />
    </div>
  )
}

/** Song of the day: today's song, time until the next one, and my rank if I sang it. */
function DailyTile() {
  const { t } = useTranslation()
  const daily = useDaily()
  return (
    <Card as="article" wide tone="violet" icon={CalendarDays} title={t('daily.title')} className="home-tile home-daily">
      {daily.isPending ? (
        // Same sizes as the loaded content below, so nothing jumps when it arrives.
        <div className="home-daily-body" aria-busy="true">
          <div className="home-daily-song">
            <Skeleton width={56} height={56} radius={12} />
            <div className="home-daily-titles">
              <Skeleton width="80%" height={18} />
              <Skeleton width="55%" height={14} />
            </div>
          </div>
          <Skeleton width="70%" height={20} />
          <Skeleton width="90%" height={20} />
        </div>
      ) : daily.data ? (
        <DailyBody daily={daily.data} />
      ) : (
        <p className="muted">{t('home.dailyText')}</p>
      )}
      <ButtonLink to="/daily" block iconRight={ArrowRight} className="home-tile-action">
        {t('home.daily')}
      </ButtonLink>
    </Card>
  )
}

function DailyBody({ daily }: { daily: DailyInfo }) {
  const { t, i18n } = useTranslation()
  const mine = daily.my_attempt
  return (
    <div className="home-daily-body">
      {daily.song ? (
        <div className="home-daily-song">
          <SongCover song={daily.song} size={56} />
          <div className="home-daily-titles">
            <strong className="home-daily-title">{daily.song.title}</strong>
            <span className="muted small home-daily-artist">{daily.song.artist}</span>
          </div>
        </div>
      ) : (
        <p className="muted">{t('daily.noSong')}</p>
      )}
      <DailyCountdown at={daily.next_song_at} />
      {mine?.rank != null ? (
        <p className="home-daily-rank">
          <Trophy size={16} aria-hidden />
          <span>
            {t('daily.yourRank', { rank: mine.rank })}
            {mine.score != null && ` · ${formatScore(mine.score, i18n.language)} ${t('game.sing.points')}`}
          </span>
        </p>
      ) : (
        <p className="muted small">{t('home.dailyText')}</p>
      )}
    </div>
  )
}

// Its own component so only this line re-renders every second.
function DailyCountdown({ at }: { at: string }) {
  const { t } = useTranslation()
  const now = useNow(1000)
  const left = formatTimeLeft(Date.parse(at) - now)
  return (
    <p className="home-daily-next">
      <Timer size={16} aria-hidden />
      <span>{t('home.dailyNext', { time: left })}</span>
    </p>
  )
}

/** Three steps, each with a little picture drawn from the note lane. */
function HowItWorks() {
  const { t } = useTranslation()
  const steps = [
    { art: <ArtCreate />, title: t('home.createRoom'), text: t('home.howCreate') },
    { art: <ArtJoin />, title: t('home.howJoinTitle'), text: t('home.howJoin') },
    { art: <ArtSing />, title: t('home.howSingTitle'), text: t('home.howSing') },
  ]
  return (
    <section className="how" aria-labelledby="how-title">
      <h2 id="how-title" className="how-title">
        {t('home.howTitle')}
      </h2>
      <ol className="how-steps">
        {steps.map((step, i) => (
          <li key={i} className="how-step">
            {step.art}
            <div className="how-step-text">
              <h3>
                <span className="how-num" aria-hidden>
                  {i + 1}
                </span>
                {step.title}
              </h3>
              <p className="muted">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

// The three small pictures. Decorative: the step text says it all. Colours come from the
// mini-lane classes in components.css plus a few .how-art ones in home.css.
const GRID = [16, 32, 48]

function ArtCreate() {
  return (
    <svg className="how-art" viewBox="0 0 160 64" aria-hidden>
      <rect width="160" height="64" rx="14" className="mini-lane-bg" />
      {GRID.map((y) => (
        <line key={y} x1="0" x2="160" y1={y} y2={y} className="mini-lane-grid" />
      ))}
      <rect x="16" y="35" width="26" height="7" rx="3.5" className="mini-lane-note" />
      <rect x="116" y="21" width="28" height="7" rx="3.5" className="mini-lane-note" />
      <circle cx="80" cy="32" r="17" className="how-art-plus-bg" />
      <path d="M80 24v16M72 32h16" className="how-art-plus" />
    </svg>
  )
}

function ArtJoin() {
  // A QR-like tile on the left, the room code as dots on the right.
  const cells = [
    [0, 0], [2, 0], [4, 1], [1, 2], [3, 2], [0, 3], [2, 4], [4, 3], [3, 4],
  ]
  return (
    <svg className="how-art" viewBox="0 0 160 64" aria-hidden>
      <rect width="160" height="64" rx="14" className="mini-lane-bg" />
      <rect x="14" y="10" width="44" height="44" rx="7" className="how-art-qr" />
      <g transform="translate(19 15)">
        {cells.map(([cx, cy], i) => (
          <rect key={i} x={cx * 7} y={cy * 7} width="6" height="6" rx="1.5" className="how-art-qr-dot" />
        ))}
      </g>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={72 + i * 13} y="26" width="10" height="12" rx="3" className={i < 4 ? 'mini-lane-note hit' : 'mini-lane-note'} />
      ))}
    </svg>
  )
}

function ArtSing() {
  // Three tiny phones, each with its own lane and pitch line.
  return (
    <svg className="how-art" viewBox="0 0 160 64" aria-hidden>
      <rect width="160" height="64" rx="14" className="mini-lane-bg" />
      {[18, 62, 106].map((x, i) => (
        <g key={x} transform={`translate(${x} 8)`}>
          <rect width="36" height="48" rx="7" className="how-art-phone" />
          <rect x="6" y={26 - i * 4} width="10" height="5" rx="2.5" className="mini-lane-note hit" />
          <rect x="19" y={18 + i * 3} width="11" height="5" rx="2.5" className="mini-lane-note" />
          <polyline points={`6,${30 - i * 4} 11,${27 - i * 4} 16,${29 - i * 4}`} className="how-art-trace" />
          <rect x="8" y="38" width="20" height="4" rx="2" className="how-art-score" />
        </g>
      ))}
    </svg>
  )
}
