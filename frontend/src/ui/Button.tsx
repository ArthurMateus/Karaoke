import type { LucideIcon } from 'lucide-react'
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { buttonClass, type ButtonSize, type ButtonVariant, type Look } from './buttonClass'
import { cx } from './cx'

const ICON_SIZE: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 }

function Inner({ icon: Icon, iconRight: IconRight, size = 'md', loading, children }: Look & { loading?: boolean; children?: ReactNode }) {
  const px = ICON_SIZE[size]
  return (
    <>
      {loading ? <span className="spinner" aria-hidden /> : Icon && <Icon size={px} aria-hidden className="button-icon" />}
      {children != null && <span className="button-label">{children}</span>}
      {IconRight && <IconRight size={px} aria-hidden className="button-icon" />}
    </>
  )
}

type ButtonProps = Look & ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }

/** The one button: primary (the main action), secondary, ghost (quiet) or danger. */
export function Button({ variant, size, block, icon, iconRight, loading, className, disabled, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, block }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      <Inner icon={icon} iconRight={iconRight} size={size} loading={loading}>
        {children}
      </Inner>
    </button>
  )
}

/** A link inside the app that looks like a button. */
export function ButtonLink({ variant, size, block, icon, iconRight, className, children, ...rest }: Look & LinkProps) {
  return (
    <Link className={buttonClass({ variant, size, block }, className)} {...rest}>
      <Inner icon={icon} iconRight={iconRight} size={size}>
        {children}
      </Inner>
    </Link>
  )
}

/** A link to another page or site (opens with href) that looks like a button. */
export function ButtonAnchor({ variant, size, block, icon, iconRight, className, children, ...rest }: Look & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={buttonClass({ variant, size, block }, className)} {...rest}>
      <Inner icon={icon} iconRight={iconRight} size={size}>
        {children}
      </Inner>
    </a>
  )
}

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  icon: LucideIcon
  label: string // read out by screen readers and shown as a tooltip
  variant?: ButtonVariant
  size?: ButtonSize
}

/** A square button with just an icon. The label is required: it's the button's name. */
export function IconButton({ icon: Icon, label, variant = 'ghost', size = 'md', className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx('icon-button', variant, size === 'sm' && 'small', size === 'lg' && 'lg', className)}
      {...rest}
    >
      <Icon size={ICON_SIZE[size]} aria-hidden />
    </button>
  )
}
