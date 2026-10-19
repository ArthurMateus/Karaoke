import { useTranslation } from 'react-i18next'
import { useMe, useUpdateMe } from '../api/hooks'
import type { Locale } from '../api/types'
import { LOCALES, currentLocale } from '../i18n'

export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  const { data } = useMe()
  const updateMe = useUpdateMe()

  const change = (locale: Locale) => {
    void i18n.changeLanguage(locale)
    // Remember it on the account too, so emails arrive in the right language.
    if (data?.user) updateMe.mutate({ locale })
  }

  return (
    <select
      className="lang-select"
      aria-label={t('nav.language')}
      value={currentLocale()}
      onChange={(e) => change(e.target.value as Locale)}
    >
      {LOCALES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.code === 'en' ? 'EN' : 'PT'}
        </option>
      ))}
    </select>
  )
}
