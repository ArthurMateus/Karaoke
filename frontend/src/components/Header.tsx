import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { useMe, useSignOut } from '../api/hooks'
import LanguageSwitcher from './LanguageSwitcher'

export default function Header() {
  const { t } = useTranslation()
  const { data } = useMe()
  const signOut = useSignOut()
  const navigate = useNavigate()
  const user = data?.user

  return (
    <header className="header">
      <Link to="/" className="logo">
        🎤 <span>{t('app.name')}</span>
      </Link>
      <nav className="header-nav">
        <LanguageSwitcher />
        {user ? (
          <>
            <Link to="/profile" className="chip" title={t('nav.profile')}>
              {user.display_name}
            </Link>
            <button
              className="link-button"
              onClick={() => signOut.mutate(undefined, { onSuccess: () => navigate('/') })}
            >
              {t('nav.signOut')}
            </button>
          </>
        ) : (
          <Link to="/sign-in">{t('nav.signIn')}</Link>
        )}
      </nav>
    </header>
  )
}
