import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useVerifyMagicLink } from '../api/hooks'
import ErrorText from '../components/ErrorText'
import { currentLocale } from '../i18n'

/** Where the emailed link lands. Exchanges the token for a session, then moves on. */
export default function VerifyPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const verify = useVerifyMagicLink()
  const started = useRef(false) // tokens work once; don't send twice in React dev mode

  const token = params.get('token') ?? ''
  const next = params.get('next') ?? '/'

  useEffect(() => {
    if (started.current) return
    started.current = true
    verify.mutate(
      { token, locale: currentLocale() },
      // Only follow paths on this site.
      { onSuccess: () => navigate(next.startsWith('/') && !next.startsWith('//') ? next : '/', { replace: true }) },
    )
  }, [token, next, verify, navigate])

  if (verify.isError) {
    return (
      <section className="card stack">
        <h1>{t('verify.failedTitle')}</h1>
        <ErrorText error={verify.error} />
        <Link className="button" to={`/sign-in?next=${encodeURIComponent(next)}`}>
          {t('verify.tryAgain')}
        </Link>
      </section>
    )
  }
  return <p className="center muted">{t('verify.working')}</p>
}
