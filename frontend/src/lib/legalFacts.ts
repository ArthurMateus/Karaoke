import type { SiteConfig } from '../api/types'

/** What the {{tokens}} in frontend/src/legal/*.md stand for, from GET /api/config. */
export interface LegalFallbacks {
  notSet: string // any value the operator hasn't set yet
  betaEndUnset: string // the beta end date, while it isn't decided
  formatDate: (iso: string) => string
}

// Settings are plain text: keep them from turning into Markdown links, bold or tokens.
const plain = (value: string) => value.replace(/[[\]*`{}]/g, '').trim()

/** Fill in who runs the app. A value that isn't set shows as a neutral "not set yet",
 *  never as bracketed placeholder text. Unknown tokens are left alone. */
export function fillLegalText(source: string, config: SiteConfig | undefined, f: LegalFallbacks): string {
  const unset = `*${f.notSet}*`
  const value = (raw: string | undefined) => (raw && plain(raw)) || unset
  const email = config?.contact_email && plain(config.contact_email)
  const end = config?.beta_end_date && plain(config.beta_end_date)
  const facts: Record<string, string> = {
    operator: value(config?.operator_name),
    city: value(config?.operator_city),
    contact: email ? `[${email}](mailto:${email})` : unset,
    hosting: value(config?.hosting_provider),
    email_provider: value(config?.email_provider),
    beta_end: end ? f.formatDate(end) : f.betaEndUnset,
  }
  return source.replace(/{{(\w+)}}/g, (token, name: string) => facts[name] ?? token)
}

/** "2027-01-31" in the reader's language; anything else as it was written. */
export function formatIsoDate(iso: string, locale: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return iso
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(date)
}
