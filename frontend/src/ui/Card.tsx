import type { LucideIcon } from 'lucide-react'
import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  eyebrow?: ReactNode
  title?: ReactNode
  icon?: LucideIcon
  actions?: ReactNode // top right, e.g. a badge or a small button
  raised?: boolean // lifts on hover; for cards you click
  wide?: boolean // no 540 px limit
  tone?: 'default' | 'stage' | 'violet'
  as?: 'section' | 'article' | 'div' | 'li'
}

/** A white card with an optional heading row: icon, eyebrow, title and actions. */
export function Card({ eyebrow, title, icon: Icon, actions, raised, wide, tone = 'default', as: Tag = 'section', className, children, ...rest }: CardProps) {
  const hasHead = eyebrow != null || title != null || actions != null || Icon
  return (
    <Tag className={cx('card stack', raised && 'raised', wide && 'wide', tone !== 'default' && `tone-${tone}`, className)} {...rest}>
      {hasHead && (
        <header className="card-head">
          {Icon && (
            <span className="card-icon" aria-hidden>
              <Icon size={18} />
            </span>
          )}
          <div className="card-titles">
            {eyebrow != null && <span className="eyebrow">{eyebrow}</span>}
            {title != null && <h2>{title}</h2>}
          </div>
          {actions != null && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </Tag>
  )
}

/** The top of a page: title, a line under it, and actions on the right (below on phones). */
export function PageHeader({ eyebrow, title, subtitle, actions, icon: Icon }: {
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  icon?: LucideIcon
}) {
  return (
    <header className="page-header">
      {Icon && (
        <span className="page-icon" aria-hidden>
          <Icon size={22} />
        </span>
      )}
      <div className="page-titles">
        {eyebrow != null && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {subtitle != null && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions != null && <div className="page-actions">{actions}</div>}
    </header>
  )
}

/** A titled group inside a page, without a card around it. */
export function Section({ title, icon: Icon, actions, children, className }: {
  title: ReactNode
  icon?: LucideIcon
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cx('section', className)}>
      <div className="section-head">
        <h2 className="section-title">
          {Icon && <Icon size={18} aria-hidden />}
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  )
}
