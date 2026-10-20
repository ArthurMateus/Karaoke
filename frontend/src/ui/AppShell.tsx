import { CalendarDays, ChevronDown, LogIn, LogOut, Mic, Music, ShieldCheck, User as UserIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, useNavigate } from 'react-router'
import { useMe, usePlan, useSignOut } from '../api/hooks'
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
      <a className="skip-link" href="#main">
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
  const { data } = useMe()
  const user = data?.user
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
      <nav className="header-nav" aria-label={t('nav.main')}>
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className="nav-link" title={label}>
            <Icon size={18} aria-hidden />
            <span className="nav-label">{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="header-end">
        <LanguageSwitcher />
        {user ? (
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
  const kind = plan.data?.plan

  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    root.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus()
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  return (
    <div className="profile-menu" ref={root}>
      <button
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
  return (
    <footer className="footer">
      <div className="footer-inner">
        <Link to="/" className="footer-brand">
          <BrandMark size={22} /> {t('app.name')}
        </Link>
        <nav className="footer-links" aria-label={t('footer.label')}>
          <Link to="/terms">{t('footer.terms')}</Link>
          <Link to="/privacy">{t('footer.privacy')}</Link>
          <Link to="/credits">{t('footer.credits')}</Link>
        </nav>
        <p className="footer-note">{t('footer.note')}</p>
      </div>
    </footer>
  )
}
