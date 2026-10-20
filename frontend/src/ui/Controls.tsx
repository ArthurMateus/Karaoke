import { Check, Copy } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { useCopy, useCountUp } from './hooks'
import { useTranslation } from 'react-i18next'
import { cx } from './cx'

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  icon?: LucideIcon
  disabled?: boolean
}

/** Two or three choices side by side, one picked (a radio group). Arrow keys move between them. */
export function Segmented<T extends string>({ options, value, onChange, label, size = 'md' }: {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  size?: 'sm' | 'md'
}) {
  const move = (from: number, step: number) => {
    const enabled = options.filter((o) => !o.disabled)
    const at = enabled.findIndex((o) => o.value === options[from].value)
    const next = enabled[(at + step + enabled.length) % enabled.length]
    if (next) onChange(next.value)
  }
  return (
    <div className={cx('segmented', size)} role="radiogroup" aria-label={label}>
      {options.map((o, i) => {
        const Icon = o.icon
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            disabled={o.disabled}
            className={on ? 'on' : ''}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') move(i, 1)
              else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') move(i, -1)
              else return
              e.preventDefault()
            }}
          >
            {Icon && <Icon size={16} aria-hidden />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** A bar that fills up, with an optional label above it. */
export function ProgressBar({ value, label, detail, tone = 'violet' }: { value: number; label?: ReactNode; detail?: ReactNode; tone?: 'violet' | 'live' | 'ok' }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div className="progress-block">
      {(label != null || detail != null) && (
        <div className="progress-label small">
          <span>{label}</span>
          <span className="muted">{detail ?? `${pct}%`}</span>
        </div>
      )}
      <div className={cx('progress', tone)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-bar" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** A big number with a label under it ("10,000 / points"). */
export function Stat({ value, label, format = String, countUp, icon: Icon, tone }: {
  value: number
  label: ReactNode
  format?: (n: number) => string
  countUp?: boolean
  icon?: LucideIcon
  tone?: 'violet' | 'live' | 'premium'
}) {
  const counted = useCountUp(value)
  const n = countUp ? counted : value
  return (
    <div className={cx('stat', tone)}>
      {Icon && <Icon size={18} aria-hidden className="stat-icon" />}
      <b className="stat-value">
        {/* Screen readers get the final number, not every step of the count. */}
        <span aria-hidden>{format(n)}</span>
        <span className="sr-only">{format(value)}</span>
      </b>
      <span className="stat-label">{label}</span>
    </div>
  )
}

/** A text you might want to copy (a link, a code), with a copy button next to it. */
export function CopyField({ value, label, display, big }: { value: string; label: string; display?: ReactNode; big?: boolean }) {
  const { t } = useTranslation()
  const [copied, copy] = useCopy()
  const input = useRef<HTMLInputElement>(null)
  const onCopy = async () => {
    // Clipboard blocked (e.g. http on a phone): select the text so it can be copied by hand.
    if (!(await copy(value))) input.current?.select()
  }
  return (
    <div className={cx('copy-field', big && 'big')}>
      {display != null ? (
        <span className="copy-display">{display}</span>
      ) : (
        <input ref={input} className="copy-value" readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} />
      )}
      <button type="button" className={cx('copy-button', copied && 'done')} onClick={onCopy} aria-label={copied ? t('ui.copied') : `${t('ui.copy')}: ${label}`}>
        {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
        <span>{copied ? t('ui.copied') : t('ui.copy')}</span>
      </button>
    </div>
  )
}

/** A ring that empties as time runs out, with the time (or anything) in the middle. */
export function CountdownRing({ left, total, size = 64, children, label }: { left: number; total: number; size?: number; children?: ReactNode; label?: string }) {
  const r = 26
  const c = 2 * Math.PI * r
  const part = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0
  return (
    <span className="countdown-ring" style={{ width: size, height: size }} role={label ? 'timer' : undefined} aria-label={label}>
      <svg viewBox="0 0 60 60" aria-hidden>
        <circle cx="30" cy="30" r={r} className="ring-track" />
        <circle cx="30" cy="30" r={r} className="ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - part)} />
      </svg>
      <span className="ring-center">{children}</span>
    </span>
  )
}
