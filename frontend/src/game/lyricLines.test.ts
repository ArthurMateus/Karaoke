import { describe, expect, it } from 'vitest'
import type { EditorChart, EditorLine } from '../editor/chartModel'
import { lyricLines, lyricPosition } from './lyricLines'
import { buildTimeline, lineIndexAt } from './timeline'

const note = (start: number, text: string, kind: EditorLine['notes'][number]['kind'] = 'normal') => ({ kind, start, length: 4, pitch: 0, text })

const chart: EditorChart = {
  title: 'Duet',
  artist: '',
  language: 'en',
  bpm: 60, // 0.25 s per beat
  gap_ms: 1000,
  singers: {},
  lines: [
    { singer: 'P1', notes: [note(0, 'Hel'), note(4, 'lo'), note(8, ' world')] },
    { singer: 'P2', notes: [note(16, 'Yo', 'rap'), note(20, ' there', 'rap_golden')] },
    { singer: 'both', notes: [note(32, 'All'), note(36, '~'), note(40, ' sing')] },
  ],
}

describe('lyricLines', () => {
  it('uses the same lines and times as the timeline for a part', () => {
    for (const part of ['P1', 'P2'] as const) {
      const lines = lyricLines(chart, part)
      const timeline = buildTimeline(chart, part)
      expect(lines.map((l) => [l.start, l.end])).toEqual(timeline.lines.map((l) => [l.start, l.end]))
      expect(lines.flatMap((l) => l.words.map((w) => w.start))).toEqual(timeline.notes.map((n) => n.start))
    }
  })

  it('keeps who sings each line and the rap kinds', () => {
    expect(lyricLines(chart, 'P2').map((l) => l.singer)).toEqual(['P2', 'both'])
    expect(lyricLines(chart, 'P2')[0].words.map((w) => w.kind)).toEqual(['rap', 'rap_golden'])
  })

  it('shows every part to watchers', () => {
    expect(lyricLines(chart, null).map((l) => l.singer)).toEqual(['P1', 'P2', 'both'])
  })
})

describe('lyricPosition', () => {
  const lines = lyricLines(chart, 'P1')
  const timeline = buildTimeline(chart, 'P1')

  it('matches the note lane line choice and counts started notes', () => {
    for (let t = -2; t < 15; t += 0.05) {
      const { line, sung } = lyricPosition(lines, t)
      expect(line).toBe(lineIndexAt(timeline, t))
      expect(sung).toBe(timeline.lines[line].notes.filter((n) => n.start <= t).length)
    }
  })

  it('is safe with no lines', () => {
    expect(lyricPosition([], 3)).toEqual({ line: 0, sung: 0 })
  })
})
