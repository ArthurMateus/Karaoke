// A chart turned into seconds, for one singer's part.

import { beatToSeconds, lineText, type EditorChart, type NoteKind } from '../editor/chartModel'

export interface TimedNote {
  start: number // seconds into the song
  end: number
  midi: number // target pitch (MIDI number)
  kind: NoteKind
  text: string
  line: number
}

export interface TimedLine {
  start: number
  end: number
  text: string
  notes: TimedNote[]
}

export interface Timeline {
  lines: TimedLine[]
  notes: TimedNote[]
  end: number
}

export type Part = 'P1' | 'P2'

export function buildTimeline(chart: EditorChart, part: Part = 'P1'): Timeline {
  const mine = chart.lines.filter((line) => line.singer === part || line.singer === 'both')
  const lines = (mine.length > 0 ? mine : chart.lines).map((line, index): TimedLine => {
    const notes = line.notes.map((n) => ({
      start: beatToSeconds(chart, n.start),
      end: beatToSeconds(chart, n.start + n.length),
      midi: n.pitch + 60,
      kind: n.kind,
      text: n.text,
      line: index,
    }))
    return { start: notes[0].start, end: Math.max(...notes.map((n) => n.end)), text: lineText(line), notes }
  })
  lines.sort((a, b) => a.start - b.start)
  lines.forEach((line, i) => line.notes.forEach((n) => (n.line = i)))
  const notes = lines.flatMap((l) => l.notes)
  return { lines, notes, end: Math.max(0, ...lines.map((l) => l.end)) }
}

/** Index of the line to show at `time`: the current one, or the next one coming up. */
export function lineIndexAt(timeline: Timeline, time: number): number {
  for (let i = 0; i < timeline.lines.length; i++) {
    if (time < timeline.lines[i].end + 0.3) return i
  }
  return timeline.lines.length - 1
}
