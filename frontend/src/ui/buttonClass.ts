import type { LucideIcon } from 'lucide-react'
import { cx } from './cx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface Look {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean // full width
  icon?: LucideIcon
  iconRight?: LucideIcon
}

export function buttonClass({ variant = 'secondary', size = 'md', block }: Look, extra?: string): string {
  return cx('button', variant !== 'secondary' && variant, size === 'sm' && 'small', size === 'lg' && 'lg', block && 'block', extra)
}
