import { ArrowLeft, LogIn, Mail, MailCheck, RotateCw, Send } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { useRequestMagicLink } from '../api/hooks'
import AuthCard from '../components/AuthCard'
import ErrorText from '../components/ErrorText'
import { currentLocale } from '../i18n'
import { Button, useToast } from '../ui'

export default function SignInPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const request = useRequestMagicLink()

  const send = (again = false) =>
    request.mutate(
      { email, locale: currentLocale(), next: params.get('next') ?? undefined },
      {
        onSuccess: () => {
          setSentTo(email)
          if (again) toast.success(t('signIn.sentAgain'))
        },
      },
    )

  const submit = (e: FormEvent) => {
    e.preventDefault()
    send()
  }

  if (sentTo) {
    return (
      <AuthCard
        icon={MailCheck}
        tone="ok"
        title={t('signIn.sentTitle')}
        lead={<Trans i18nKey="signIn.sentTo" values={{ email: sentTo }} components={{ b: <b className="auth-email" /> }} />}
      >
        <p className="muted small">{t('signIn.sentHelp')}</p>
        {import.meta.env.DEV && <p className="auth-note small">{t('signIn.devHint')}</p>}
        <div className="auth-actions">
          <Button icon={RotateCw} loading={request.isPending} onClick={() => send(true)}>
            {t('signIn.sendAgain')}
          </Button>
          <Button
            variant="ghost"
            icon={ArrowLeft}
            onClick={() => {
              setSentTo(null)
              request.reset()
            }}
          >
            {t('signIn.useOther')}
          </Button>
        </div>
        <ErrorText error={request.error} />
      </AuthCard>
    )
  }

  return (
    <AuthCard icon={LogIn} title={t('signIn.title')} lead={t('signIn.intro')}>
      <form className="auth-form" onSubmit={submit}>
        <label htmlFor="email">{t('signIn.email')}</label>
        <div className="input-with-icon">
          <Mail size={18} aria-hidden />
          <input
            id="email"
            className="input"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder={t('signIn.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button variant="primary" size="lg" block type="submit" icon={Send} loading={request.isPending}>
          {request.isPending ? t('signIn.sending') : t('signIn.send')}
        </Button>
      </form>
      <ErrorText error={request.error} />
      <p className="muted small auth-foot">{t('signIn.newHere')}</p>
    </AuthCard>
  )
}
