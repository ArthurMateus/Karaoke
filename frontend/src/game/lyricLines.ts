// Lyrics for the Simple sing view: each line with who sings it and when each word starts.
// Times use the same beat maths and line choice as buildTimeline (timeline.ts), so the
// word highlight follows the same moments as the note lane. Display only: never scored.

import { beatToSeconds, type EditorChart, type NoteKind, type Singer } from '../editor/chartModel'
import type { Part } from './timeline'

export interface LyricWord {
  text: string
  start: number // seconds into the song
  kind: NoteKind
}

export interface LyricLine {
  singer: Singer
  start: number
  end: number
  words: LyricWord[]
}

/** The lines `part` sings (with "both" lines), or every line when `part` is null (watchers). */
export function lyricLines(chart: EditorChart, part: Part | null): LyricLine[] {
  const mine = part ? chart.lines.filter((line) => line.singer === part || line.singer === 'both') : chart.lines
  const lines = (mine.length > 0 ? mine : chart.lines).map((line): LyricLine => {
    const words = line.notes.map((n) => ({ text: n.text, start: beatToSeconds(chart, n.start), kind: n.kind }))
    const end = Math.max(...line.notes.map((n) => beatToSeconds(chart, n.start + n.length)))
    return { singer: line.singer, start: words[0].start, end, words }
  })
  return lines.sort((a, b) => a.start - b.start)
}

/** Which line to show at `time` (the current one, or the next coming up) and how many of its notes have started. */
export function lyricPosition(lines: LyricLine[], time: number): { line: number; sung: number } {
  let line = lines.length - 1
  for (let i = 0; i < lines.length; i++) {
    if (time < lines[i].end + 0.3) {
      line = i
      break
    }
  }
  const sung = lines[line]?.words.filter((w) => w.start <= time).length ?? 0
  return { line: Math.max(0, line), sung }
}
