import { Check, Crown } from 'lucide-react'
import type { CSSProperties } from 'react'
import { cx } from './cx'
import { initialOf } from './format'

export interface AvatarProps {
  name: string
  color: string // a CSS colour, usually playerColor(index)
  size?: 'sm' | 'md' | 'lg' | 'xl'
  host?: boolean // a small crown
  ready?: boolean // a small check
  away?: boolean // dimmed
  me?: boolean // a ring around it
  label?: string // what a screen reader says; defaults to the name
  decorative?: boolean // the name is written next to it, so hide it from screen readers
}

/** A player's round initial in their colour, with host / ready / away marks. */
export function Avatar({ name, color, size = 'md', host, ready, away, me, label, decorative }: AvatarProps) {
  return (
    <span
      className={cx('avatar', size, away && 'away', me && 'me')}
      style={{ '--avatar-color': color } as CSSProperties}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : (label ?? name)}
      aria-hidden={decorative || undefined}
    >
      <span className="avatar-initial">{initialOf(name)}</span>
      {host && (
        <span className="avatar-crown">
          <Crown size={size === 'sm' ? 9 : 12} strokeWidth={2.5} />
        </span>
      )}
      {ready && (
        <span className="avatar-check">
          <Check size={size === 'sm' ? 9 : 12} strokeWidth={3.5} />
        </span>
      )}
    </span>
  )
}

/** A few overlapping avatars and "+N" for the rest. */
export function AvatarStack({ people, max = 4, size = 'sm', label }: {
  people: { id: string; name: string; color: string }[]
  max?: number
  size?: AvatarProps['size']
  label: string // e.g. "3 players: Ana, Lia, Bo"
}) {
  const shown = people.slice(0, max)
  const rest = people.length - shown.length
  return (
    <span className={cx('avatar-stack', size)} role="img" aria-label={label}>
      {shown.map((p) => (
        <Avatar key={p.id} name={p.name} color={p.color} size={size} decorative />
      ))}
      {rest > 0 && <span className={cx('avatar', size, 'more')} aria-hidden>+{rest}</span>}
    </span>
  )
}
