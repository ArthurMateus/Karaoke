// A tiny Markdown reader for the footer pages (Terms, Privacy, Credits): headings, paragraphs,
// lists, quotes, tables, rules, **bold**, *italics*, `code` and [links](url). It builds React
// elements, never HTML strings, so nothing in the text can run as code.
import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router'

import { parseMarkdown } from './markdownParse'

/** **bold**, *italics*, `code` and [links](url) inside a line. */
function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\))/g
  let last = 0
  let key = 0
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[2] != null) out.push(<strong key={key++}>{renderInline(m[2])}</strong>)
    else if (m[3] != null) out.push(<em key={key++}>{renderInline(m[3])}</em>)
    else if (m[4] != null) out.push(<code key={key++}>{m[4]}</code>)
    else out.push(<MarkdownLink key={key++} href={m[6]}>{renderInline(m[5])}</MarkdownLink>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function MarkdownLink({ href, children }: { href: string; children: ReactNode }) {
  // "./privacy" in the drafts means the app's own page.
  if (href.startsWith('./')) return <Link to={`/${href.slice(2)}`}>{children}</Link>
  if (href.startsWith('/')) return <a href={href}>{children}</a>
  if (!/^(https?:|mailto:)/.test(href)) return <>{children}</> // anything else isn't followed
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}

export function Markdown({ source }: { source: string }) {
  return (
    <>
      {parseMarkdown(source).map((block, i) => {
        switch (block.type) {
          case 'heading': {
            const Tag = (['h1', 'h2', 'h3', 'h4'] as const)[block.level - 1]
            return <Tag key={i}>{renderInline(block.text)}</Tag>
          }
          case 'paragraph':
            return <p key={i}>{renderInline(block.text)}</p>
          case 'quote':
            return <blockquote key={i}>{renderInline(block.text)}</blockquote>
          case 'rule':
            return <hr key={i} />
          case 'list':
            return (
              <ul key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ul>
            )
          case 'table':
            return (
              <div key={i} className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {block.head.map((h, j) => (
                        <th key={j}>{renderInline(h)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, j) => (
                      <tr key={j}>
                        {row.map((c, k) => (
                          <td key={k}>{renderInline(c)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          default:
            return <Fragment key={i} />
        }
      })}
    </>
  )
}
