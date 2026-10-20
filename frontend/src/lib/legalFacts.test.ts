import { describe, expect, it } from 'vitest'
import type { SiteConfig } from '../api/types'
import { fillLegalText, formatIsoDate } from './legalFacts'

const fallbacks = { notSet: 'not set yet', betaEndUnset: 'a date we announce', formatDate: (d: string) => `D:${d}` }
const config: SiteConfig = {
  operator_name: 'Ana Example',
  operator_city: 'Rio de Janeiro, RJ',
  contact_email: 'hello@example.com',
  hosting_provider: '',
  email_provider: 'Mail [Co]',
  beta_end_date: '2027-01-31',
  invite_only: true,
  terms_version: 'beta-1',
}

describe('fillLegalText', () => {
  it('fills in the operator details', () => {
    const text = fillLegalText('{{operator}}, {{city}}. Write to {{contact}}. Ends {{beta_end}}.', config, fallbacks)
    expect(text).toBe('Ana Example, Rio de Janeiro, RJ. Write to [hello@example.com](mailto:hello@example.com). Ends D:2027-01-31.')
  })

  it('shows a neutral text for values that are not set, never brackets', () => {
    const text = fillLegalText('{{hosting}} / {{operator}} / {{contact}} / {{beta_end}}', undefined, fallbacks)
    expect(text).toBe('*not set yet* / *not set yet* / *not set yet* / a date we announce')
    expect(fillLegalText('{{hosting}}', config, fallbacks)).toBe('*not set yet*')
  })

  it('keeps settings from becoming Markdown', () => {
    expect(fillLegalText('{{email_provider}}', config, fallbacks)).toBe('Mail Co')
  })

  it('leaves unknown tokens alone', () => {
    expect(fillLegalText('{{nope}}', config, fallbacks)).toBe('{{nope}}')
  })
})

describe('formatIsoDate', () => {
  it('formats a date in the reader language', () => {
    expect(formatIsoDate('2027-01-31', 'en')).toBe('January 31, 2027')
    expect(formatIsoDate('2027-01-31', 'pt-BR')).toBe('31 de janeiro de 2027')
    expect(formatIsoDate('end of January', 'en')).toBe('end of January')
  })
})
