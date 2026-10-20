import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router'
import { useAdminAction, useAdminCodes, useAdminGrants, useMe } from '../api/hooks'
import type { AdminCode } from '../api/types'
import ErrorText from '../components/ErrorText'
import { useConfirm } from '../ui'

type Kind = 'premium' | 'party_pass'

/** For admins (ADMIN_EMAILS): give premium or Party Passes, and make redeem codes to hand out. */
export default function AdminPage() {
  const me = useMe()
  if (me.isPending) return null
  if (!me.data?.user?.is_admin) return <Navigate to="/" replace />
  return (
    <div className="stack">
      <GrantForm />
      <Grants />
      <CodeForm />
      <Codes />
    </div>
  )
}

function useDate() {
  const { i18n } = useTranslation()
  return (iso: string | null) => (iso ? new Date(iso).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' }) : '–')
}

function GrantForm() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [kind, setKind] = useState<Kind>('premium')
  const [days, setDays] = useState(30)
  const [note, setNote] = useState('')
  const give = useAdminAction<void>(() => '/api/admin/grants', () => ({ email, kind, days, note }))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    give.mutate(undefined, { onSuccess: () => setEmail('') })
  }
  return (
    <section className="card stack">
      <h1>{t('admin.title')}</h1>
      <h2>{t('admin.give')}</h2>
      <form className="stack tight" onSubmit={submit}>
        <label htmlFor="grant-email">{t('admin.email')}</label>
        <input id="grant-email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <KindAndDays kind={kind} days={days} onKind={setKind} onDays={setDays} />
        <label htmlFor="grant-note">{t('admin.note')}</label>
        <input id="grant-note" className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="button primary" type="submit" disabled={give.isPending}>
          {t('admin.giveButton')}
        </button>
        {give.isSuccess && <p className="small ok-text">{t('admin.given')}</p>}
        <ErrorText error={give.error} />
      </form>
    </section>
  )
}

function KindAndDays({ kind, days, onKind, onDays }: { kind: Kind; days: number; onKind: (k: Kind) => void; onDays: (d: number) => void }) {
  const { t } = useTranslation()
  return (
    <div className="row wrap">
      <label className="stack tight">
        <span>{t('admin.what')}</span>
        <select className="input" value={kind} onChange={(e) => onKind(e.target.value as Kind)}>
          <option value="premium">{t('admin.kinds.premium')}</option>
          <option value="party_pass">{t('admin.kinds.party_pass')}</option>
        </select>
      </label>
      {kind === 'premium' && (
        <label className="stack tight">
          <span>{t('admin.days')}</span>
          <input className="input number" type="number" min={1} max={3660} value={days} onChange={(e) => onDays(Number(e.target.value))} />
        </label>
      )}
    </div>
  )
}

function Grants() {
  const { t } = useTranslation()
  const date = useDate()
  const grants = useAdminGrants()
  const revoke = useAdminAction<string>((id) => `/api/admin/grants/${id}/revoke`)
  const confirm = useConfirm()
  return (
    <section className="card stack">
      <h2>{t('admin.grants')}</h2>
      <ErrorText error={grants.error ?? revoke.error} />
      {grants.data?.length === 0 && <p className="muted">{t('admin.noneYet')}</p>}
      <div className="table-scroll">
        <table className="admin-table small">
          <tbody>
            {grants.data?.map((g) => (
              <tr key={g.id} className={g.revoked ? 'muted' : ''}>
                <td>{g.email}</td>
                <td>{t(`admin.kinds.${g.kind}`)}</td>
                <td>{g.starts_at ? `${date(g.starts_at)} → ${date(g.ends_at)}` : t('admin.notStarted')}</td>
                <td>{t(`admin.sources.${g.source}`, { defaultValue: g.source })}{g.note && ` · ${g.note}`}</td>
                <td>
                  {g.revoked ? t('admin.revoked') : (
                    <button className="link-button danger small" onClick={async () => {
                      if (await confirm({ title: t('admin.confirmRevoke', { email: g.email }), confirmLabel: t('admin.revoke'), danger: true })) revoke.mutate(g.id)
                    }}>
                      {t('admin.revoke')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function CodeForm() {
  const { t } = useTranslation()
  const [kind, setKind] = useState<Kind>('party_pass')
  const [days, setDays] = useState(30)
  const [maxUses, setMaxUses] = useState(1)
  const [count, setCount] = useState(1)
  const [expires, setExpires] = useState('')
  const [note, setNote] = useState('')
  const [made, setMade] = useState<AdminCode[]>([])
  const [error, setError] = useState<unknown>(null)
  const make = useAdminAction<void>(() => '/api/admin/codes', () => ({
    kind, days, max_uses: maxUses, count, note, expires_in_days: expires ? Number(expires) : null,
  }))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    make.mutate(undefined, { onSuccess: (codes) => setMade(codes as AdminCode[]), onError: setError })
  }
  return (
    <section className="card stack">
      <h2>{t('admin.makeCodes')}</h2>
      <p className="muted small">{t('admin.codesHelp')}</p>
      <form className="stack tight" onSubmit={submit}>
        <KindAndDays kind={kind} days={days} onKind={setKind} onDays={setDays} />
        <div className="row wrap">
          <label className="stack tight">
            <span>{t('admin.howMany')}</span>
            <input className="input number" type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </label>
          <label className="stack tight">
            <span>{t('admin.usesEach')}</span>
            <input className="input number" type="number" min={1} max={10000} value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} />
          </label>
          <label className="stack tight">
            <span>{t('admin.expiresIn')}</span>
            <input className="input number" type="number" min={1} max={3660} placeholder="–" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </label>
        </div>
        <label htmlFor="code-note">{t('admin.note')}</label>
        <input id="code-note" className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="button primary" type="submit" disabled={make.isPending}>
          {t('admin.makeButton', { count })}
        </button>
        <ErrorText error={error} />
      </form>
      {made.length > 0 && (
        <div className="stack tight">
          <strong>{t('admin.newCodes')}</strong>
          <textarea className="input lyrics-text" readOnly rows={Math.min(8, made.length + 1)} value={made.map((c) => c.code).join('\n')} />
        </div>
      )}
    </section>
  )
}

function Codes() {
  const { t } = useTranslation()
  const date = useDate()
  const codes = useAdminCodes()
  const disable = useAdminAction<string>((id) => `/api/admin/codes/${id}/disable`)
  return (
    <section className="card stack">
      <h2>{t('admin.codes')}</h2>
      <ErrorText error={codes.error ?? disable.error} />
      {codes.data?.length === 0 && <p className="muted">{t('admin.noneYet')}</p>}
      <div className="table-scroll">
        <table className="admin-table small">
          <tbody>
            {codes.data?.map((c) => (
              <tr key={c.id} className={c.disabled ? 'muted' : ''}>
                <td className="mono">{c.code}</td>
                <td>{c.kind === 'premium' ? t('admin.premiumDays', { count: c.days }) : t('admin.kinds.party_pass')}</td>
                <td>{t('admin.used', { uses: c.uses, max: c.max_uses })}</td>
                <td>{c.expires_at ? t('admin.expires', { date: date(c.expires_at) }) : ''}{c.note && ` · ${c.note}`}</td>
                <td>
                  {c.disabled ? t('admin.disabled') : (
                    <button className="link-button danger small" onClick={() => disable.mutate(c.id)}>
                      {t('admin.disable')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
