// Markdown blocks for the footer pages: see markdown.tsx.

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'table'; head: string[]; rows: string[][] }
  | { type: 'rule' }

const cells = (line: string) =>
  line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (!line.trim()) {
      i++
    } else if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length as 1 | 2 | 3 | 4, text: heading[2].trim() })
      i++
    } else if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ type: 'rule' })
      i++
    } else if (line.startsWith('>')) {
      const quote: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) quote.push(lines[i++].replace(/^>\s?/, ''))
      blocks.push({ type: 'quote', text: quote.join(' ') })
    } else if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*([-*]\s+|\s{2,}\S)/.test(lines[i]) && lines[i].trim()) {
        if (/^\s*[-*]\s+/.test(lines[i])) items.push(lines[i].replace(/^\s*[-*]\s+/, ''))
        else items[items.length - 1] += ` ${lines[i].trim()}` // a wrapped item
        i++
      }
      blocks.push({ type: 'list', items })
    } else if (line.trim().startsWith('|') && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1] ?? '')) {
      const head = cells(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]))
      blocks.push({ type: 'table', head, rows })
    } else {
      const para: string[] = []
      while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|>|\s*[-*]\s+|\|)/.test(lines[i])) para.push(lines[i++].trim())
      if (para.length === 0) para.push(lines[i++].trim()) // a line no other rule took
      blocks.push({ type: 'paragraph', text: para.join(' ') })
    }
  }
  return blocks
}
