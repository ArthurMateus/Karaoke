import { CalendarDays, ChevronDown, LogIn, LogOut, Mic, Music, ShieldCheck, User as UserIcon } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router'
import { useMe, usePlan, useSignOut, useSiteConfig } from '../api/hooks'
import type { User } from '../api/types'
import { BrandMark } from '../components/Brand'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { Avatar } from './Avatar'
import { Badge } from './Badge'
import { ButtonLink } from './Button'

/** Every page except the stage screen: header, the page, footer. */
export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <>
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault() // keep "#main" out of the address people copy
          document.getElementById('main')?.focus()
        }}
      >
        {t('ui.skip')}
      </a>
      <Header />
      <main className="page" id="main" tabIndex={-1}>
        {children}
      </main>
      <Footer />
    </>
  )
}

function Header() {
  const { t } = useTranslation()
  const { data, isPending } = useMe()
  const user = data?.user
  const { pathname, search } = useLocation()
  // The song of the day is sung on a /solo/... page: light up "Song of the day" there, not "Solo".
  const dailyTry = pathname.startsWith('/solo/') && new URLSearchParams(search).get('daily') === '1'
  const isActive = (to: string) =>
    to === '/daily' ? pathname === '/daily' || dailyTry : !(to === '/solo' && dailyTry) && (pathname === to || pathname.startsWith(`${to}/`))
  const nav = [
    { to: '/songs', label: t('nav.songs'), icon: Music },
    { to: '/solo', label: t('nav.solo'), icon: Mic },
    { to: '/daily', label: t('nav.daily'), icon: CalendarDays },
    ...(user?.is_admin ? [{ to: '/admin', label: t('nav.admin'), icon: ShieldCheck }] : []),
  ]

  return (
    <header className="header">
      <Link to="/" className="logo" aria-label={t('app.name')}>
        <BrandMark /> <span className="logo-text">{t('app.name')}</span>
      </Link>
      <Badge tone="warn" className="beta-badge header-beta" title={t('footer.betaNote')}>
        {t('footer.beta')}
      </Badge>
      <nav className="header-nav" aria-label={t('nav.main')}>
        {nav.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className={isActive(to) ? 'nav-link active' : 'nav-link'} aria-current={isActive(to) ? 'page' : undefined} title={label}>
            <Icon size={18} aria-hidden />
            <span className="nav-label">{label}</span>
          </Link>
        ))}
      </nav>
      <div className="header-end">
        <LanguageSwitcher />
        {isPending ? (
          <span className="profile-chip placeholder" aria-hidden />
        ) : user ? (
          <ProfileMenu user={user} />
        ) : (
          <ButtonLink to="/sign-in" size="sm" variant="primary" icon={LogIn} className="header-sign-in">
            {t('nav.signIn')}
          </ButtonLink>
        )}
      </div>
    </header>
  )
}

/** The profile chip: avatar, name and plan; opens a small menu (profile, sign out). */
function ProfileMenu({ user }: { user: User }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const signOut = useSignOut()
  const plan = usePlan(!user.is_guest)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const chip = useRef<HTMLButtonElement>(null)
  const kind = plan.data?.plan

  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('pointerdown', outside)
    root.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus()
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  // Menu keys: Esc closes and returns to the chip, arrows move between the items.
  const onMenuKey = (e: KeyboardEvent) => {
    const items = [...(root.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    const go = (i: number) => items[(i + items.length) % items.length]?.focus()
    if (e.key === 'Escape') {
      setOpen(false)
      chip.current?.focus()
    } else if (e.key === 'ArrowDown') go(at + 1)
    else if (e.key === 'ArrowUp') go(at - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(-1)
    else return
    e.preventDefault()
  }

  return (
    <div
      className="profile-menu"
      ref={root}
      onKeyDown={open ? onMenuKey : undefined}
      // Tabbing out of the menu closes it.
      onBlur={(e) => open && !root.current?.contains(e.relatedTarget as Node) && setOpen(false)}
    >
      <button
        ref={chip}
        type="button"
        className="profile-chip"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${user.display_name}, ${t('nav.profile')}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar name={user.display_name} color="var(--violet)" size="sm" decorative />
        <span className="profile-name">{user.display_name}</span>
        {kind && kind !== 'free' && (
          <Badge tone={kind === 'party' ? 'pass' : 'premium'} className="profile-plan">
            {t(`plan.names.${kind}`)}
          </Badge>
        )}
        <ChevronDown size={16} aria-hidden className="profile-caret" />
      </button>
      {open && (
        <div className="menu" role="menu">
          <Link role="menuitem" className="menu-item" to="/profile" onClick={() => setOpen(false)}>
            <UserIcon size={16} aria-hidden /> {t('nav.profile')}
          </Link>
          <button
            role="menuitem"
            type="button"
            className="menu-item"
            onClick={() => {
              setOpen(false)
              signOut.mutate(undefined, { onSuccess: () => navigate('/') })
            }}
          >
            <LogOut size={16} aria-hidden /> {t('nav.signOut')}
          </button>
        </div>
      )}
    </div>
  )
}

function Footer() {
  const { t } = useTranslation()
  const config = useSiteConfig().data
  const name = config?.operator_name || t('footer.notSet')
  const email = config?.contact_email
  return (
    <footer className="footer">
      <div className="footer-inner">
        <span className="footer-brand-row">
          <Link to="/" className="footer-brand">
            <BrandMark size={22} /> {t('app.name')}
          </Link>
          <Badge tone="warn" className="beta-badge" title={t('footer.betaNote')}>
            {t('footer.beta')}
          </Badge>
        </span>
        <nav className="footer-links" aria-label={t('footer.label')}>
          <Link to="/terms">{t('footer.terms')}</Link>
          <Link to="/privacy">{t('footer.privacy')}</Link>
          <Link to="/credits">{t('footer.credits')}</Link>
        </nav>
        <p className="footer-operator">
          <span>{t('footer.runBy', { name })}</span>
          <span>
            {email ? (
              <>
                {t('footer.contact', { email: '' })}
                <a href={`mailto:${email}`}>{email}</a>
              </>
            ) : (
              t('footer.contact', { email: t('footer.notSet') })
            )}
          </span>
        </p>
        <p className="footer-note">{t('footer.note')}</p>
      </div>
    </footer>
  )
}
