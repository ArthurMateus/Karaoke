import { KeyRound, Link2Off, Mail } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { errorCodeOf } from '../api/client'
import { useVerifyMagicLink } from '../api/hooks'
import AuthCard from '../components/AuthCard'
import ErrorText from '../components/ErrorText'
import { currentLocale } from '../i18n'
import { ButtonLink } from '../ui'

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
    // An old or used link is the usual case: say so plainly. Anything else (network...) shows its own message.
    const expired = errorCodeOf(verify.error) === 'invalid_or_expired_link'
    return (
      <AuthCard
        icon={Link2Off}
        tone="danger"
        title={t('verify.failedTitle')}
        lead={expired ? t('errors.invalid_or_expired_link') : undefined}
      >
        {expired ? <p className="muted small">{t('verify.whyExpired')}</p> : <ErrorText error={verify.error} />}
        <ButtonLink variant="primary" size="lg" block icon={Mail} to={`/sign-in?next=${encodeURIComponent(next)}`}>
          {t('verify.tryAgain')}
        </ButtonLink>
      </AuthCard>
    )
  }

  return (
    <AuthCard icon={KeyRound} title={t('verify.working')} busy>
      <div className="auth-working" role="status">
        <span className="spinner" aria-hidden />
        <span className="muted small">{t('verify.wait')}</span>
      </div>
    </AuthCard>
  )
}
