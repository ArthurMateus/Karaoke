import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { useRequestMagicLink } from '../api/hooks'
import ErrorText from '../components/ErrorText'
import { currentLocale } from '../i18n'

export default function SignInPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const request = useRequestMagicLink()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    request.mutate({ email, locale: currentLocale(), next: params.get('next') ?? undefined })
  }

  if (request.isSuccess) {
    return (
      <section className="card stack">
        <h1>{t('signIn.sentTitle')}</h1>
        <p>{t('signIn.sent', { email })}</p>
        {import.meta.env.DEV && <p className="muted small">{t('signIn.devHint')}</p>}
        <button className="link-button" onClick={() => request.reset()}>
          {t('signIn.useOther')}
        </button>
      </section>
    )
  }

  return (
    <section className="card stack">
      <h1>{t('signIn.title')}</h1>
      <p className="muted">{t('signIn.intro')}</p>
      <form className="stack" onSubmit={submit}>
        <label htmlFor="email">{t('signIn.email')}</label>
        <input
          id="email"
          className="input"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className="button primary" type="submit" disabled={request.isPending}>
          {request.isPending ? t('signIn.sending') : t('signIn.send')}
        </button>
      </form>
      <ErrorText error={request.error} />
    </section>
  )
}
