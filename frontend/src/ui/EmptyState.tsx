import type { CSSProperties, ReactNode } from 'react'
import { cx } from './cx'

/** A small lane with a few waiting notes: the illustration for empty lists. */
export function MiniLane({ className }: { className?: string }) {
  return (
    <svg className={cx('mini-lane', className)} viewBox="0 0 120 56" aria-hidden>
      <rect width="120" height="56" rx="12" className="mini-lane-bg" />
      {[14, 28, 42].map((y) => (
        <line key={y} x1="0" x2="120" y1={y} y2={y} className="mini-lane-grid" />
      ))}
      <rect x="14" y="31" width="22" height="7" rx="3.5" className="mini-lane-note hit" />
      <rect x="42" y="23" width="18" height="7" rx="3.5" className="mini-lane-note" />
      <rect x="66" y="17" width="26" height="7" rx="3.5" className="mini-lane-note" />
      <rect x="98" y="27" width="16" height="7" rx="3.5" className="mini-lane-note" />
      <line x1="38" x2="38" y1="6" y2="50" className="mini-lane-now" />
    </svg>
  )
}

/** What a list shows when it has nothing in it: a picture, a line of text and maybe an action. */
export function EmptyState({ title, text, action, compact }: { title?: ReactNode; text?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cx('empty-state', compact && 'compact')}>
      <MiniLane />
      {title != null && <strong>{title}</strong>}
      {text != null && <p className="muted small">{text}</p>}
      {action}
    </div>
  )
}

/** A grey placeholder the size of the content that's still loading. */
export function Skeleton({ width = '100%', height = 16, radius, className }: { width?: number | string; height?: number | string; radius?: number | string; className?: string }) {
  return <span className={cx('skeleton', className)} style={{ width, height, borderRadius: radius } as CSSProperties} aria-hidden />
}

/** Placeholder rows for a list that's loading. */
export function SkeletonList({ rows = 3, height = 64 }: { rows?: number; height?: number }) {
  return (
    <div className="stack tight" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={height} radius="var(--r-control)" />
      ))}
    </div>
  )
}
