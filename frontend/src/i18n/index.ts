import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import type { Locale } from '../api/types'
import en from './en.json'
import ptBR from './pt-BR.json'

export const LOCALES: { code: Locale; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
]

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, 'pt-BR': { translation: ptBR } },
    supportedLngs: ['en', 'pt-BR'],
    fallbackLng: 'en',
    interpolation: { escapeValue: false }, // React already escapes
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      // Any Portuguese (pt, pt-PT, pt-BR) gets Brazilian Portuguese.
      convertDetectedLanguage: (lng: string) => (lng.toLowerCase().startsWith('pt') ? 'pt-BR' : lng),
    },
  })

export function currentLocale(): Locale {
  return i18n.resolvedLanguage === 'pt-BR' ? 'pt-BR' : 'en'
}

export default i18n
