import { FileText, Scale, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import credits from '../legal/credits.md?raw'
import privacyEn from '../legal/privacy.en.md?raw'
import privacyPt from '../legal/privacy.pt-BR.md?raw'
import termsEn from '../legal/terms.en.md?raw'
import termsPt from '../legal/terms.pt-BR.md?raw'
import { Markdown } from '../lib/markdown'
import { Badge } from '../ui'

const PAGES = {
  terms: { en: termsEn, pt: termsPt, icon: Scale },
  privacy: { en: privacyEn, pt: privacyPt, icon: ShieldCheck },
  credits: { en: credits, pt: credits, icon: FileText }, // licence notices stay in English
}

/** Terms, Privacy and Credits: drafts until a lawyer has reviewed them, and marked as such. */
export default function LegalPage({ page }: { page: keyof typeof PAGES }) {
  const { t, i18n } = useTranslation()
  const { en, pt, icon: Icon } = PAGES[page]
  return (
    <article className="legal">
      <div className="legal-top">
        <span className="page-icon" aria-hidden>
          <Icon size={22} />
        </span>
        <Badge tone="warn">{t('footer.draft')}</Badge>
      </div>
      <p className="legal-draft" role="note">
        {t('footer.draftNote')}
      </p>
      <Markdown source={i18n.resolvedLanguage === 'pt-BR' ? pt : en} />
    </article>
  )
}
