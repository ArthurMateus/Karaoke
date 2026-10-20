import { ArrowDown, ArrowUp, Ban, Check, Copy, Crown, Gift, KeyRound, ShieldCheck, Ticket, Undo2 } from 'lucide-react'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router'
import { useAdminAction, useAdminCodes, useAdminGrants, useMe } from '../api/hooks'
import type { AdminCode, AdminGrant } from '../api/types'
import ErrorText from '../components/ErrorText'
import {
  Badge, Button, Card, CopyField, EmptyState, IconButton, PageHeader, Segmented, SkeletonList,
  useConfirm, useCopy, useNow, useToast, type BadgeTone,
} from '../ui'

type Kind = 'premium' | 'party_pass'
type Order = 'desc' | 'asc' // newest first / oldest first

/** For admins (ADMIN_EMAILS): give premium or Party Passes, and make redeem codes to hand out. */
export default function AdminPage() {
  const { t } = useTranslation()
  const me = useMe()
  if (me.isPending) return null
  if (!me.data?.user?.is_admin) return <Navigate to="/" replace />
  return (
    <div className="admin">
      <PageHeader icon={ShieldCheck} title={t('admin.title')} subtitle={t('admin.subtitle')} />
      <div className="admin-forms">
        <GrantForm />
        <CodeForm />
      </div>
      <Grants />
      <Codes />
    </div>
  )
}

function useDate() {
  const { i18n } = useTranslation()
  return (iso: string | null) => (iso ? new Date(iso).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' }) : '–')
}

function sortByCreated<T extends { created_at: string }>(rows: T[] | undefined, order: Order): T[] {
  const sorted = [...(rows ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))
  return order === 'desc' ? sorted.reverse() : sorted
}

/** The "Created" column's sort switch; also shown in the card head, where phones see it. */
function SortButton({ order, onChange }: { order: Order; onChange: (o: Order) => void }) {
  const { t } = useTranslation()
  return (
    <Button size="sm" variant="ghost" icon={order === 'desc' ? ArrowDown : ArrowUp} onClick={() => onChange(order === 'desc' ? 'asc' : 'desc')}>
      {order === 'desc' ? t('admin.newestFirst') : t('admin.oldestFirst')}
    </Button>
  )
}

function SortHeader({ order, onChange, children }: { order: Order; onChange: (o: Order) => void; children: ReactNode }) {
  const { t } = useTranslation()
  const Icon = order === 'desc' ? ArrowDown : ArrowUp
  return (
    <th aria-sort={order === 'desc' ? 'descending' : 'ascending'}>
      <button
        type="button"
        className="sort-button"
        onClick={() => onChange(order === 'desc' ? 'asc' : 'desc')}
        title={order === 'desc' ? t('admin.newestFirst') : t('admin.oldestFirst')}
      >
        {children}
        <Icon size={14} aria-hidden />
      </button>
    </th>
  )
}

function KindBadge({ kind, days }: { kind: Kind; days?: number }) {
  const { t } = useTranslation()
  return kind === 'premium' ? (
    <Badge tone="premium" icon={Crown}>
      {days != null ? t('admin.premiumDays', { count: days }) : t('plan.names.premium')}
    </Badge>
  ) : (
    <Badge tone="pass" icon={Ticket}>
      {t('plan.names.party')}
    </Badge>
  )
}

function KindAndDays({ kind, days, onKind, onDays, id }: { kind: Kind; days: number; onKind: (k: Kind) => void; onDays: (d: number) => void; id: string }) {
  const { t } = useTranslation()
  return (
    <>
      <div className="stack tight">
        <span className="field-label">{t('admin.what')}</span>
        <Segmented<Kind>
          label={t('admin.what')}
          value={kind}
          onChange={onKind}
          options={[
            { value: 'premium', label: t('plan.names.premium'), icon: Crown },
            { value: 'party_pass', label: t('plan.names.party'), icon: Ticket },
          ]}
        />
        <p className="muted small">{kind === 'premium' ? t('admin.premiumHelp') : t('admin.passHelp')}</p>
      </div>
      {kind === 'premium' && (
        <div className="stack tight">
          <label htmlFor={`${id}-days`}>{t('admin.days')}</label>
          <input id={`${id}-days`} className="input number" type="number" min={1} max={3660} value={days} onChange={(e) => onDays(Number(e.target.value))} />
        </div>
      )}
    </>
  )
}

function GrantForm() {
  const { t } = useTranslation()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [kind, setKind] = useState<Kind>('premium')
  const [days, setDays] = useState(30)
  const [note, setNote] = useState('')
  const give = useAdminAction<void>(() => '/api/admin/grants', () => ({ email, kind, days, note }))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    give.mutate(undefined, {
      onSuccess: () => {
        toast.success(t('admin.givenTo', { email }))
        setEmail('')
      },
    })
  }
  return (
    <Card wide icon={Gift} title={t('admin.give')}>
      <form className="stack" onSubmit={submit}>
        <div className="stack tight">
          <label htmlFor="grant-email">{t('admin.email')}</label>
          <input id="grant-email" className="input" type="email" required autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <KindAndDays id="grant" kind={kind} days={days} onKind={setKind} onDays={setDays} />
        <div className="stack tight">
          <label htmlFor="grant-note">{t('admin.note')}</label>
          <input id="grant-note" className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <Button variant="primary" type="submit" icon={Gift} loading={give.isPending}>
          {t('admin.giveButton')}
        </Button>
        <ErrorText error={give.error} />
      </form>
    </Card>
  )
}

function grantStatus(g: AdminGrant, now: number): [BadgeTone, string] {
  if (g.revoked) return ['danger', 'revoked']
  if (!g.starts_at) return ['violet', 'waiting']
  // A minute's slack: this page's clock and the server's may differ a little.
  if (new Date(g.starts_at).getTime() > now + 60_000) return ['violet', 'upcoming']
  if (g.ends_at && new Date(g.ends_at).getTime() <= now) return ['neutral', 'ended']
  return ['ok', 'active']
}

function Grants() {
  const { t } = useTranslation()
  const date = useDate()
  const now = useNow(15_000)
  const grants = useAdminGrants()
  const revoke = useAdminAction<string>((id) => `/api/admin/grants/${id}/revoke`)
  const confirm = useConfirm()
  const [order, setOrder] = useState<Order>('desc')
  const rows = sortByCreated(grants.data, order)
  return (
    <Card wide icon={Crown} title={t('admin.grants')} actions={rows.length > 1 ? <SortButton order={order} onChange={setOrder} /> : undefined}>
      <ErrorText error={grants.error ?? revoke.error} />
      {grants.isPending && <SkeletonList rows={3} height={48} />}
      {grants.data?.length === 0 && <EmptyState compact text={t('admin.noneYet')} />}
      {rows.length > 0 && (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('admin.cols.who')}</th>
                <th>{t('admin.cols.what')}</th>
                <th>{t('admin.cols.period')}</th>
                <th>{t('admin.cols.source')}</th>
                <SortHeader order={order} onChange={setOrder}>
                  {t('admin.cols.created')}
                </SortHeader>
                <th>{t('admin.cols.status')}</th>
                <th>
                  <span className="sr-only">{t('admin.cols.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => {
                const [tone, status] = grantStatus(g, now)
                return (
                  <tr key={g.id} className={g.revoked ? 'is-off' : undefined}>
                    <td data-label={t('admin.cols.who')} className="cell-main">
                      <span className="cell-strong">{g.email ?? g.name}</span>
                      {g.email && g.name && <span className="muted small">{g.name}</span>}
                    </td>
                    <td data-label={t('admin.cols.what')}>
                      <KindBadge kind={g.kind} />
                    </td>
                    <td data-label={t('admin.cols.period')}>
                      {g.starts_at ? `${date(g.starts_at)} → ${date(g.ends_at)}` : <span className="muted">{t('admin.notStarted')}</span>}
                    </td>
                    <td data-label={t('admin.cols.source')}>
                      <span className="cell-stack">
                        <span>{t(`admin.sources.${g.source}`, { defaultValue: g.source })}</span>
                        {g.note && <span className="muted small">{g.note}</span>}
                      </span>
                    </td>
                    <td data-label={t('admin.cols.created')}>{date(g.created_at)}</td>
                    <td data-label={t('admin.cols.status')}>
                      <Badge tone={tone}>{t(`admin.status.${status}`)}</Badge>
                    </td>
                    <td className="cell-action">
                      {!g.revoked && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="danger-text"
                          icon={Undo2}
                          onClick={async () => {
                            if (await confirm({ title: t('admin.confirmRevoke', { email: g.email ?? g.name }), confirmLabel: t('admin.revoke'), danger: true })) revoke.mutate(g.id)
                          }}
                        >
                          {t('admin.revoke')}
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
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
    <Card wide icon={KeyRound} title={t('admin.makeCodes')}>
      <p className="muted small">{t('admin.codesHelp')}</p>
      <form className="stack" onSubmit={submit}>
        <KindAndDays id="code" kind={kind} days={days} onKind={setKind} onDays={setDays} />
        <div className="admin-numbers">
          <NumberField id="code-count" label={t('admin.howMany')} min={1} max={50} value={String(count)} onChange={(v) => setCount(Number(v))} />
          <NumberField id="code-uses" label={t('admin.usesEach')} min={1} max={10000} value={String(maxUses)} onChange={(v) => setMaxUses(Number(v))} />
          <NumberField id="code-expires" label={t('admin.expiresIn')} min={1} max={3660} placeholder={t('admin.never')} value={expires} onChange={setExpires} />
        </div>
        <div className="stack tight">
          <label htmlFor="code-note">{t('admin.note')}</label>
          <input id="code-note" className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <Button variant="primary" type="submit" icon={KeyRound} loading={make.isPending}>
          {t('admin.makeButton', { count })}
        </Button>
        <ErrorText error={error} />
      </form>
      {made.length > 0 && <NewCodes codes={made} />}
    </Card>
  )
}

function NumberField({ id, label, value, onChange, min, max, placeholder }: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  min: number
  max: number
  placeholder?: string
}) {
  return (
    <div className="stack tight">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input number" type="number" min={min} max={max} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

/** The codes just made: each with its own copy button, and one to copy them all. */
function NewCodes({ codes }: { codes: AdminCode[] }) {
  const { t } = useTranslation()
  const [copied, copy] = useCopy()
  return (
    <div className="new-codes" role="status">
      <div className="row spread">
        <strong>{t('admin.newCodes')}</strong>
        {codes.length > 1 && (
          <Button size="sm" icon={copied ? Check : Copy} onClick={() => void copy(codes.map((c) => c.code).join('\n'))}>
            {copied ? t('ui.copied') : t('admin.copyAll')}
          </Button>
        )}
      </div>
      <ul className="new-codes-list">
        {codes.map((c) => (
          <li key={c.id}>
            <CopyField value={c.code} label={c.code} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function codeStatus(c: AdminCode, now: number): [BadgeTone, string] {
  if (c.disabled) return ['danger', 'disabled']
  if (c.uses >= c.max_uses) return ['neutral', 'usedUp']
  if (c.expires_at && new Date(c.expires_at).getTime() <= now) return ['neutral', 'expired']
  return ['ok', 'active']
}

function CopyCode({ code }: { code: string }) {
  const { t } = useTranslation()
  const [copied, copy] = useCopy()
  const text = useRef<HTMLSpanElement>(null)
  const onCopy = async () => {
    // Clipboard blocked (e.g. http on a phone): select the code so it can be copied by hand.
    if (!(await copy(code)) && text.current) getSelection()?.selectAllChildren(text.current)
  }
  return (
    <span className="code-cell">
      <span className="mono" ref={text}>
        {code}
      </span>
      <IconButton
        size="sm"
        icon={copied ? Check : Copy}
        label={copied ? t('ui.copied') : `${t('ui.copy')}: ${code}`}
        className={copied ? 'copied' : undefined}
        onClick={() => void onCopy()}
      />
    </span>
  )
}

function Codes() {
  const { t } = useTranslation()
  const date = useDate()
  const now = useNow(15_000)
  const codes = useAdminCodes()
  const disable = useAdminAction<string>((id) => `/api/admin/codes/${id}/disable`)
  const confirm = useConfirm()
  const [order, setOrder] = useState<Order>('desc')
  const rows = sortByCreated(codes.data, order)
  return (
    <Card wide icon={Ticket} title={t('admin.codes')} actions={rows.length > 1 ? <SortButton order={order} onChange={setOrder} /> : undefined}>
      <ErrorText error={codes.error ?? disable.error} />
      {codes.isPending && <SkeletonList rows={3} height={48} />}
      {codes.data?.length === 0 && <EmptyState compact text={t('admin.noneYet')} />}
      {rows.length > 0 && (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('admin.cols.code')}</th>
                <th>{t('admin.cols.what')}</th>
                <th>{t('admin.cols.uses')}</th>
                <th>{t('admin.cols.expires')}</th>
                <SortHeader order={order} onChange={setOrder}>
                  {t('admin.cols.created')}
                </SortHeader>
                <th>{t('admin.cols.status')}</th>
                <th>
                  <span className="sr-only">{t('admin.cols.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const [tone, status] = codeStatus(c, now)
                return (
                  <tr key={c.id} className={c.disabled ? 'is-off' : undefined}>
                    <td data-label={t('admin.cols.code')} className="cell-main">
                      <CopyCode code={c.code} />
                      {c.note && <span className="muted small cell-note">{c.note}</span>}
                    </td>
                    <td data-label={t('admin.cols.what')}>
                      <KindBadge kind={c.kind} days={c.kind === 'premium' ? c.days : undefined} />
                    </td>
                    <td data-label={t('admin.cols.uses')} className="num">
                      {c.uses} / {c.max_uses}
                    </td>
                    <td data-label={t('admin.cols.expires')}>{c.expires_at ? date(c.expires_at) : <span className="muted">{t('admin.never')}</span>}</td>
                    <td data-label={t('admin.cols.created')}>{date(c.created_at)}</td>
                    <td data-label={t('admin.cols.status')}>
                      <Badge tone={tone}>{t(`admin.status.${status}`)}</Badge>
                    </td>
                    <td className="cell-action">
                      {!c.disabled && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="danger-text"
                          icon={Ban}
                          onClick={async () => {
                            if (await confirm({ title: t('admin.confirmDisable', { code: c.code }), message: t('admin.confirmDisableText'), confirmLabel: t('admin.disable'), danger: true })) disable.mutate(c.id)
                          }}
                        >
                          {t('admin.disable')}
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
