import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from '../ui'
import { LaneArt } from './Brand'

/** The card for signing in, the emailed link and joining a room: lane art on top, a round icon
 *  over its edge, then a title and the content. `tone` colours the icon for the state. */
export default function AuthCard({ icon: Icon, tone = 'violet', title, lead, children, busy }: {
  icon: LucideIcon
  tone?: 'violet' | 'ok' | 'danger'
  title: ReactNode
  lead?: ReactNode
  children?: ReactNode
  busy?: boolean
}) {
  return (
    <section className="auth-card" aria-busy={busy || undefined}>
      <div className="auth-art">
        <LaneArt />
      </div>
      <div className="auth-body">
        <span className={cx('auth-icon', tone)} aria-hidden>
          <Icon size={26} />
        </span>
        <h1 className="auth-title">{title}</h1>
        {lead != null && <p className="auth-lead">{lead}</p>}
        {children}
      </div>
    </section>
  )
}
