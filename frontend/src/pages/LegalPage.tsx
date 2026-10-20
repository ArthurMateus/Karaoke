import { FileText, List, Scale, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import credits from '../legal/credits.md?raw'
import privacyEn from '../legal/privacy.en.md?raw'
import privacyPt from '../legal/privacy.pt-BR.md?raw'
import termsEn from '../legal/terms.en.md?raw'
import termsPt from '../legal/terms.pt-BR.md?raw'
import { Markdown } from '../lib/markdown'
import { Badge, cx } from '../ui'

const PAGES = {
  terms: { en: termsEn, pt: termsPt, icon: Scale },
  privacy: { en: privacyEn, pt: privacyPt, icon: ShieldCheck },
  credits: { en: credits, pt: credits, icon: FileText }, // licence notices stay in English
}

// Credits in Portuguese: the title, the intro line and the section headings come from the
// language file; the notices and licence texts stay in English, as their authors wrote them.
const CREDITS_HEADINGS: Record<string, string> = {
  Songs: 'songs',
  Fonts: 'fonts',
  'Icons and effects': 'icons',
  'In your browser': 'browser',
  'On our servers': 'servers',
  'AI models': 'models',
  'Licence texts': 'licences',
}

interface Part {
  id: string
  title: string
  body: string
}

const slug = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** The text before the first "## " heading, then one part per "## " heading. */
function splitSections(source: string): { intro: string; parts: Part[] } {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const intro: string[] = []
  const parts: Part[] = []
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.*)$/)
    if (h2) {
      const title = h2[1].trim()
      parts.push({ id: slug(title) || `part-${parts.length + 1}`, title, body: '' })
    } else if (parts.length) parts[parts.length - 1].body += `${line}\n`
    else intro.push(line)
  }
  return { intro: intro.join('\n'), parts }
}

/** Terms, Privacy and Credits: drafts until a lawyer has reviewed them, and marked as such. */
export default function LegalPage({ page }: { page: keyof typeof PAGES }) {
  const { t, i18n } = useTranslation()
  const pt = i18n.resolvedLanguage === 'pt-BR'
  const { en, pt: ptSource, icon: Icon } = PAGES[page]
  const source = pt ? ptSource : en
  const translateCredits = pt && page === 'credits'

  const { intro, parts } = useMemo(() => {
    const split = splitSections(source)
    if (!translateCredits) return split
    return {
      intro: split.intro
        .replace(/^# .*$/m, `# ${t('legal.credits.title')}`)
        .replace(/^Encore is made with .*$/m, t('legal.credits.intro')),
      parts: split.parts.map((p) => (CREDITS_HEADINGS[p.title] ? { ...p, title: t(`legal.credits.headings.${CREDITS_HEADINGS[p.title]}`) } : p)),
    }
  }, [source, translateCredits, t])

  const active = useActiveSection(parts.map((p) => p.id))
  const article = useRef<HTMLElement>(null)
  useTableLabels(article, source)

  const toc = (
    <ol className="legal-toc-list">
      {parts.map((p) => (
        <li key={p.id}>
          <a href={`#${p.id}`} className={cx(active === p.id && 'on')} aria-current={active === p.id ? 'location' : undefined}>
            {p.title}
          </a>
        </li>
      ))}
    </ol>
  )

  return (
    <div className="legal-layout">
      <aside className="legal-side" aria-label={t('legal.onThisPage')}>
        <nav className="legal-toc">
          <span className="eyebrow">{t('legal.onThisPage')}</span>
          {toc}
        </nav>
      </aside>

      <article className="legal" ref={article}>
        <div className="legal-top">
          <span className="page-icon" aria-hidden>
            <Icon size={22} />
          </span>
          <Badge tone="warn" icon={TriangleAlert}>
            {t('footer.draft')}
          </Badge>
        </div>
        <p className="legal-draft" role="note">
          <TriangleAlert size={20} aria-hidden />
          <span>{t('footer.draftNote')}</span>
        </p>
        <Markdown source={intro} />
        {translateCredits && <p className="legal-lang-note">{t('legal.credits.englishNote')}</p>}

        {parts.length > 2 && (
          <details className="legal-toc-mobile">
            <summary>
              <List size={18} aria-hidden />
              {t('legal.onThisPage')}
            </summary>
            {toc}
          </details>
        )}

        {parts.map((p) => (
          <section key={p.id} className="legal-section" aria-labelledby={p.id}>
            <h2 id={p.id}>{p.title}</h2>
            <Markdown source={p.body} />
          </section>
        ))}
      </article>
    </div>
  )
}

/** Which section is being read: the last heading that has scrolled past the top third. */
function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null)
  const key = ids.join('|')
  useEffect(() => {
    const list = key ? key.split('|') : []
    let frame = 0
    const update = () => {
      frame = 0
      let current: string | null = null
      for (const id of list) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top < window.innerHeight * 0.3) current = id
      }
      setActive(current ?? list[0] ?? null)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [key])
  return active
}

/** On phones each table row becomes a small card: every cell gets its column name to show. */
function useTableLabels(root: RefObject<HTMLElement | null>, source: string) {
  useEffect(() => {
    root.current?.querySelectorAll('table').forEach((table) => {
      const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent ?? '')
      table.querySelectorAll('tbody tr').forEach((tr) => {
        tr.querySelectorAll('td').forEach((td, i) => td.setAttribute('data-label', heads[i] ?? ''))
      })
    })
  }, [root, source])
}
