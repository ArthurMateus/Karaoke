import { describe, expect, it } from 'vitest'
import type { EditorChart } from '../editor/chartModel'
import { foldToTarget, pitchClassDistance, rate, Scorer } from './scoring'
import { buildTimeline, lineIndexAt, type Timeline } from './timeline'

// BPM 300 -> 50 ms per beat. Two lines of two notes, 0.5 s each, starting at 1.0 s.
const chart: EditorChart = {
  title: 'T', artist: 'A', language: 'en', bpm: 300, gap_ms: 1000, singers: {},
  lines: [
    { singer: 'P1', notes: [{ kind: 'normal', start: 0, length: 10, pitch: 0, text: 'Twin' }, { kind: 'golden', start: 10, length: 10, pitch: 7, text: 'kle' }] },
    { singer: 'P2', notes: [{ kind: 'normal', start: 30, length: 10, pitch: 4, text: 'Up' }, { kind: 'freestyle', start: 40, length: 10, pitch: 0, text: ' hey' }] },
    { singer: 'both', notes: [{ kind: 'rap', start: 60, length: 10, pitch: 0, text: 'Yo' }] },
  ],
}

const FRAME = 1 / 90

/** Feed the scorer as if someone sang `pitchAt(t)` (null = silent) for the whole song. */
function sing(timeline: Timeline, pitchAt: (t: number) => number | null, level = 0.1) {
  const scorer = new Scorer(timeline)
  for (let t = 0; t < timeline.end + 0.5; t += FRAME) {
    const midi = pitchAt(t)
    scorer.addFrame(t, midi, midi === null ? 0 : 0.9, midi === null ? 0 : level, FRAME)
  }
  return scorer
}

/** The right pitch at every moment. */
function perfect(timeline: Timeline) {
  return (t: number) => timeline.notes.find((n) => n.start <= t && t < n.end)?.midi ?? null
}

describe('timeline', () => {
  it('converts beats to seconds and keeps only my part', () => {
    const p1 = buildTimeline(chart, 'P1')
    expect(p1.lines.map((l) => l.text)).toEqual(['Twinkle', 'Yo'])
    expect(p1.notes[0]).toMatchObject({ start: 1, end: 1.5, midi: 60 })
    expect(p1.notes[1]).toMatchObject({ start: 1.5, end: 2, midi: 67, kind: 'golden' })
    const p2 = buildTimeline(chart, 'P2')
    expect(p2.lines.map((l) => l.text)).toEqual(['Up hey', 'Yo'])
    expect(p2.end).toBeCloseTo(4.5)
  })

  it('finds the line to show', () => {
    const t = buildTimeline(chart, 'P1')
    expect(lineIndexAt(t, 0)).toBe(0)
    expect(lineIndexAt(t, 2.2)).toBe(0) // just finished, still shown briefly
    expect(lineIndexAt(t, 2.5)).toBe(1)
  })
})

describe('Scorer', () => {
  const timeline = buildTimeline(chart, 'P1')

  it('gives 10,000 for perfect singing', () => {
    expect(sing(timeline, perfect(timeline)).total()).toBe(10_000)
  })

  it('ignores the octave', () => {
    const lowOctave = (t: number) => {
      const midi = perfect(timeline)(t)
      return midi === null ? null : midi - 12
    }
    expect(sing(timeline, lowOctave).total()).toBe(10_000)
  })

  it('gives nothing for silence or wrong notes', () => {
    expect(sing(timeline, () => null).total()).toBe(0)
    // 3.5 semitones away from both C (60) and G (67)
    const wrong = sing(timeline, (t) => (perfect(timeline)(t) === null ? null : 63.5))
    expect(wrong.noteFraction(0)).toBe(0)
    expect(wrong.noteFraction(1)).toBe(0)
    expect(wrong.noteFraction(2)).toBe(1) // the rap note only checks timing
  })

  it('accepts being within a semitone', () => {
    const sharp = (t: number) => {
      const midi = perfect(timeline)(t)
      return midi === null ? null : midi + 0.9
    }
    expect(sing(timeline, sharp).total()).toBe(10_000)
  })

  it('weights golden notes double', () => {
    // Sing only the first (normal) note vs only the second (golden) note of line 1.
    const onlyFirst = sing(timeline, (t) => (t >= 1 && t < 1.5 ? 60 : null))
    const onlyGolden = sing(timeline, (t) => (t >= 1.5 && t < 2 ? 67 : null))
    expect(onlyGolden.total()).toBeGreaterThan(onlyFirst.total() * 1.8)
  })

  it('gives partial credit for half a note', () => {
    const half = sing(timeline, (t) => (t >= 1 && t < 1.25 ? 60 : null))
    const fraction = half.noteFraction(0)
    expect(fraction).toBeGreaterThan(0.5)
    expect(fraction).toBeLessThan(0.7)
  })

  it('counts line bonuses only once a line is over', () => {
    const scorer = sing(timeline, perfect(timeline))
    expect(scorer.total(2.1)).toBeLessThan(scorer.total())
    expect(scorer.lineFraction(0)).toBe(1)
  })

  it('needs enough clarity and volume', () => {
    const scorer = new Scorer(timeline)
    for (let t = 1; t < 1.5; t += FRAME) scorer.addFrame(t, 60, 0.2, 0.1, FRAME) // breathy, unclear
    for (let t = 1.5; t < 2; t += FRAME) scorer.addFrame(t, 67, 0.9, 0.001, FRAME) // far too quiet
    expect(scorer.total()).toBe(0)
  })
})

describe('helpers', () => {
  it('measures pitch distance without octaves', () => {
    expect(pitchClassDistance(60, 72)).toBe(0)
    expect(pitchClassDistance(61, 60)).toBe(1)
    expect(pitchClassDistance(59.5, 72)).toBe(0.5)
    expect(pitchClassDistance(66, 60)).toBe(6)
  })

  it('folds a sung pitch next to the target for drawing', () => {
    expect(foldToTarget(48.3, 60)).toBeCloseTo(60.3)
    expect(foldToTarget(73, 60)).toBe(61)
  })

  it('rates lines', () => {
    expect([0.95, 0.75, 0.5, 0.25, 0.1].map(rate)).toEqual(['perfect', 'great', 'good', 'ok', 'miss'])
  })
})
