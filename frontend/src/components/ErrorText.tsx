import { useTranslation } from 'react-i18next'
import { errorCodeOf } from '../api/client'

/** Shows a translated message for an API error code. */
export default function ErrorText({ error }: { error: unknown }) {
  const { t } = useTranslation()
  if (!error) return null
  const code = typeof error === 'string' ? error : errorCodeOf(error)
  return (
    <p className="error" role="alert">
      {t(`errors.${code}`, { defaultValue: t('errors.unknown_error') })}
    </p>
  )
}
