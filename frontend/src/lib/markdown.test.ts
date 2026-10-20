import { describe, expect, it } from 'vitest'
import { parseMarkdown } from './markdownParse'

describe('parseMarkdown', () => {
  it('reads headings, paragraphs, lists and quotes', () => {
    const blocks = parseMarkdown(`# Terms

> **DRAFT**, to be reviewed.

Line one
continues here.

- first
- second
  wraps on

## 2. Age`)
    expect(blocks).toEqual([
      { type: 'heading', level: 1, text: 'Terms' },
      { type: 'quote', text: '**DRAFT**, to be reviewed.' },
      { type: 'paragraph', text: 'Line one continues here.' },
      { type: 'list', items: ['first', 'second wraps on'] },
      { type: 'heading', level: 2, text: '2. Age' },
    ])
  })

  it('reads tables and rules', () => {
    const blocks = parseMarkdown(`| Software | Licence |
|---|---|
| React | MIT |
| Caddy | Apache-2.0 |

---`)
    expect(blocks).toEqual([
      { type: 'table', head: ['Software', 'Licence'], rows: [['React', 'MIT'], ['Caddy', 'Apache-2.0']] },
      { type: 'rule' },
    ])
  })

  it('keeps a line it does not understand as text', () => {
    expect(parseMarkdown('| not a table')).toEqual([{ type: 'paragraph', text: '| not a table' }])
  })
})
