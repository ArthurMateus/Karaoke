import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { usePlan, useRedeemCode, useStartPartyPass } from '../api/hooks'
import ErrorText from './ErrorText'

/** My plan: what it allows, Party Passes waiting to be started, and a box for redeem codes. */
export default function PlanCard() {
  const { t, i18n } = useTranslation()
  const plan = usePlan(true)
  const redeem = useRedeemCode()
  const startPass = useStartPartyPass()
  const [code, setCode] = useState('')
  const date = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })

  if (!plan.data) return <ErrorText error={plan.error} />
  const p = plan.data

  const submit = (e: FormEvent) => {
    e.preventDefault()
    redeem.mutate(code, { onSuccess: () => setCode('') })
  }

  return (
    <section className="card stack">
      <span className="eyebrow">{t('plan.title')}</span>
      <div className="row wrap">
        <h2>{t(`plan.names.${p.plan}`)}</h2>
        {p.plan === 'premium' && p.premium_until && <span className="tag ok">{t('plan.until', { date: date(p.premium_until) })}</span>}
        {p.party_until && <span className="tag host">{t('plan.partyUntil', { date: date(p.party_until) })}</span>}
      </div>
      <ul className="plan-limits small">
        <li>{t('plan.roomSize', { count: p.max_room_size })}</li>
        <li>{p.modes.includes('spotlight') ? t('plan.spotlightYes') : t('plan.spotlightNo')}</li>
        <li>{p.replays ? t('plan.replaysYes') : t('plan.replaysNo')}</li>
        <li>{t('plan.conversions', { count: p.conversions_per_month })}</li>
      </ul>

      {p.unused_passes > 0 && (
        <div className="stack tight pass-box">
          <strong>{t('plan.passesWaiting', { count: p.unused_passes })}</strong>
          <p className="muted small">{t('plan.passHelp')}</p>
          <button className="button primary" disabled={startPass.isPending || !!p.party_until} onClick={() => startPass.mutate()}>
            {p.party_until ? t('plan.passRunning') : t('plan.startPass')}
          </button>
          <ErrorText error={startPass.error} />
        </div>
      )}

      <form className="stack tight" onSubmit={submit}>
        <label htmlFor="redeem-code">{t('plan.redeem')}</label>
        <div className="row">
          <input id="redeem-code" className="input code-input" placeholder="KP-XXXX-XXXX" maxLength={20} value={code}
            autoCapitalize="characters" autoComplete="off" onChange={(e) => setCode(e.target.value)} />
          <button className="button" type="submit" disabled={!code.trim() || redeem.isPending}>
            {t('plan.redeemButton')}
          </button>
        </div>
        {redeem.isSuccess && <p className="small ok-text">{t('plan.redeemed')}</p>}
        <ErrorText error={redeem.error} />
      </form>
    </section>
  )
}
