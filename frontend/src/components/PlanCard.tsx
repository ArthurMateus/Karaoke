import type { LucideIcon } from 'lucide-react'
import { CircleCheck, Crown, Gift, Lock, Music, Repeat2, Sparkles, Ticket, Upload, Users } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { usePlan, useRedeemCode, useStartPartyPass } from '../api/hooks'
import type { PlanInfo } from '../api/types'
import { Button, ProgressBar, Skeleton, cx, formatTimeLeft, useConfirm, useNow, useToast } from '../ui'
import ErrorText from './ErrorText'

const PASS_MS = 24 * 3600 * 1000 // a Night Pass runs 24 hours from when it's started

function useDate() {
  const { i18n } = useTranslation()
  return (iso: string, style: 'long' | 'time' = 'long') =>
    new Date(iso).toLocaleString(
      i18n.language,
      style === 'time' ? { weekday: 'short', hour: '2-digit', minute: '2-digit' } : { dateStyle: 'medium', timeStyle: 'short' },
    )
}

/** My plan: what it allows, Night Passes waiting to be started, and a box for redeem codes. */
export default function PlanCard() {
  const { t } = useTranslation()
  const plan = usePlan(true)

  if (plan.isError) {
    return (
      <section className="card stack plan-card">
        <ErrorText error={plan.error} />
      </section>
    )
  }
  if (!plan.data) {
    // The size of the real card: the plan block, four features and the code box.
    return (
      <section className="card stack plan-card" aria-busy="true" aria-label={t('plan.title')}>
        <Skeleton height={124} radius="14px" />
        <div className="stack tight">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={40} radius="10px" />
          ))}
        </div>
        <Skeleton height={46} radius="var(--r-control)" />
      </section>
    )
  }
  return <Plan p={plan.data} onPassEnded={() => void plan.refetch()} />
}

function Plan({ p, onPassEnded }: { p: PlanInfo; onPassEnded: () => void }) {
  const { t } = useTranslation()
  const spotlight = p.modes.includes('spotlight')
  return (
    <section className="card stack plan-card" aria-labelledby="plan-name">
      {p.plan === 'party' && p.party_until ? (
        <PartyHero until={p.party_until} onEnded={onPassEnded} />
      ) : p.plan === 'premium' ? (
        <PremiumHero p={p} />
      ) : (
        <FreeHero />
      )}

      <div className="stack tight">
        <h3 className="plan-sub">{t('plan.whatYouGet')}</h3>
        <ul className="plan-features">
          <Feature icon={Users} on text={t('plan.roomSize', { count: p.max_room_size })} />
          <Feature icon={Sparkles} on={spotlight} text={spotlight ? t('plan.spotlightYes') : t('plan.spotlightNo')} />
          <Feature icon={Repeat2} on={p.replays} text={p.replays ? t('plan.replaysYes') : t('plan.replaysNo')} />
          <Feature icon={Upload} on text={t('plan.conversions', { count: p.conversions_per_month })} />
        </ul>
      </div>

      {p.unused_passes > 0 && <PassesWaiting p={p} />}
      <Redeem />
    </section>
  )
}

function FreeHero() {
  const { t } = useTranslation()
  return (
    <div className="plan-hero free">
      <span className="plan-hero-icon" aria-hidden>
        <Music size={24} />
      </span>
      <div className="plan-hero-text">
        <span className="eyebrow">{t('plan.title')}</span>
        <h2 id="plan-name">{t('plan.names.free')}</h2>
        <p className="small">{t('plan.freeHint')}</p>
      </div>
    </div>
  )
}

function PremiumHero({ p }: { p: PlanInfo }) {
  const { t } = useTranslation()
  const date = useDate()
  return (
    <div className="plan-hero premium">
      <span className="plan-hero-icon" aria-hidden>
        <Crown size={24} />
      </span>
      <div className="plan-hero-text">
        <span className="eyebrow">{t('plan.title')}</span>
        <h2 id="plan-name">{t('plan.names.premium')}</h2>
        {p.premium_until && <p className="small">{t('plan.until', { date: date(p.premium_until) })}</p>}
        {p.party_until && <p className="small">{t('plan.partyUntil', { date: date(p.party_until) })}</p>}
      </div>
    </div>
  )
}

/** A running Night Pass, as a ticket with the time left counting down. */
function PartyHero({ until, onEnded }: { until: string; onEnded: () => void }) {
  const { t } = useTranslation()
  const date = useDate()
  const now = useNow(1000)
  const left = new Date(until).getTime() - now
  const ended = left <= 0
  const told = useRef(false) // ask for the new plan once when the pass runs out
  useEffect(() => {
    if (ended && !told.current) {
      told.current = true
      onEnded()
    }
  }, [ended, onEnded])
  return (
    <div className="plan-hero party">
      <span className="plan-hero-icon" aria-hidden>
        <Ticket size={26} />
      </span>
      <div className="plan-hero-text">
        <span className="eyebrow">{t('plan.title')}</span>
        <h2 id="plan-name">{t('plan.names.party')}</h2>
        <p className="plan-time" role="timer" aria-label={t('plan.timeLeft', { time: formatTimeLeft(left) })}>
          <b aria-hidden>{formatTimeLeft(left)}</b> <span aria-hidden>{t('plan.left')}</span>
        </p>
        <ProgressBar value={(left / PASS_MS) * 100} tone="live" detail={t('plan.until', { date: date(until, 'time') })} />
      </div>
    </div>
  )
}

function Feature({ icon: Icon, on, text }: { icon: LucideIcon; on: boolean; text: string }) {
  const { t } = useTranslation()
  return (
    <li className={cx('plan-feature', on ? 'on' : 'off')}>
      <span className="plan-feature-icon" aria-hidden>
        <Icon size={18} />
      </span>
      <span className="plan-feature-text">{text}</span>
      {on ? (
        <CircleCheck size={18} className="plan-feature-mark" aria-hidden />
      ) : (
        <Lock size={16} className="plan-feature-mark" aria-hidden />
      )}
      <span className="sr-only">{on ? t('plan.included') : t('plan.notIncluded')}</span>
    </li>
  )
}

function PassesWaiting({ p }: { p: PlanInfo }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const toast = useToast()
  const startPass = useStartPartyPass()
  const running = !!p.party_until
  const start = async () => {
    const ok = await confirm({ title: t('plan.confirmStart'), message: t('plan.passHelp'), confirmLabel: t('plan.startPass') })
    if (ok) startPass.mutate(undefined, { onSuccess: () => toast.success(t('plan.passStarted')) })
  }
  return (
    <div className="ticket plan-ticket">
      <span className="ticket-icon" aria-hidden>
        <Ticket size={22} />
      </span>
      <div className="ticket-body">
        <strong>{t('plan.passesWaiting', { count: p.unused_passes })}</strong>
        <p className="small">{t('plan.passHelp')}</p>
        <Button variant="primary" icon={Ticket} disabled={running} loading={startPass.isPending} onClick={start}>
          {running ? t('plan.passRunning') : t('plan.startPass')}
        </Button>
        <ErrorText error={startPass.error} />
      </div>
    </div>
  )
}

/** "Have a code?": one field with the button attached, like the copy fields. */
function Redeem() {
  const { t } = useTranslation()
  const toast = useToast()
  const redeem = useRedeemCode()
  const [code, setCode] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    redeem.mutate(code, {
      onSuccess: () => {
        setCode('')
        toast.success(t('plan.redeemed'))
      },
    })
  }
  return (
    <form className="stack tight plan-redeem" onSubmit={submit}>
      <label htmlFor="redeem-code" className="plan-sub">
        {t('plan.redeem')}
      </label>
      <div className="redeem-field">
        <Gift size={18} aria-hidden className="redeem-icon" />
        <input
          id="redeem-code"
          className="redeem-value"
          placeholder="KP-XXXX-XXXX"
          maxLength={20}
          value={code}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setCode(e.target.value)}
        />
        <button type="submit" className="copy-button" disabled={!code.trim() || redeem.isPending}>
          {redeem.isPending && <span className="spinner" aria-hidden />}
          <span>{t('plan.redeemButton')}</span>
        </button>
      </div>
      <p className="muted small">{t('plan.redeemHelp')}</p>
      <ErrorText error={redeem.error} />
    </form>
  )
}
