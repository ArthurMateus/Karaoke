import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from './cx'

export type BadgeTone = 'neutral' | 'violet' | 'ok' | 'warn' | 'danger' | 'premium' | 'live' | 'pass'

/** A small label: "Host", "Ready", "Duet", a plan... `live` adds a pulsing dot (still under reduced motion). */
export function Badge({ tone = 'neutral', icon: Icon, children, className, title }: {
  tone?: BadgeTone
  icon?: LucideIcon
  children: ReactNode
  className?: string
  title?: string
}) {
  return (
    <span className={cx('badge', tone, className)} title={title}>
      {tone === 'live' && <span className="badge-dot" aria-hidden />}
      {Icon && <Icon size={13} aria-hidden strokeWidth={2.5} />}
      {children}
    </span>
  )
}
