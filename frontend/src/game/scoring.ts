// Scoring, in the style of UltraStar: 9,000 points for hitting the notes and
// 1,000 for good lines, so a perfect song is 10,000.
//
// Every pitch frame (about 90 per second) that falls inside a note and is close
// enough to its pitch counts as "hit" time for that note. The octave doesn't
// matter, so anyone can sing along in a comfortable range.

import type { Timeline, TimedNote } from './timeline'

export const NOTE_POINTS = 9000
export const LINE_POINTS = 1000

export interface ScoringOptions {
  tolerance: number // semitones either side that still count as on pitch
  minClarity: number // how clearly pitched a frame must be
  minLevel: number // how loud (RMS) a frame must be to count as singing (rap notes)
}

export const DEFAULT_OPTIONS: ScoringOptions = { tolerance: 1, minClarity: 0.5, minLevel: 0.01 }

const WEIGHT: Record<TimedNote['kind'], number> = { normal: 1, golden: 2, rap: 1, rap_golden: 2, freestyle: 0 }

/** A note counts as fully sung at 85% of its length (onsets and endings are always a bit off). */
const FULL_CREDIT = 0.85

export type Rating = 'perfect' | 'great' | 'good' | 'ok' | 'miss'

export function rate(fraction: number): Rating {
  if (fraction >= 0.9) return 'perfect'
  if (fraction >= 0.7) return 'great'
  if (fraction >= 0.45) return 'good'
  if (fraction >= 0.2) return 'ok'
  return 'miss'
}

/** Semitones between two pitches, ignoring octaves (0..6). */
export function pitchClassDistance(a: number, b: number): number {
  const d = (((a - b) % 12) + 12) % 12
  return Math.min(d, 12 - d)
}

/** Move `midi` by whole octaves to sit as close as possible to `target` (for drawing). */
export function foldToTarget(midi: number, target: number): number {
  return midi + 12 * Math.round((target - midi) / 12)
}

export class Scorer {
  private readonly timeline: Timeline
  private readonly options: ScoringOptions
  private readonly hit: number[]
  private readonly totalWeight: number
  private cursor = 0

  constructor(timeline: Timeline, options: Partial<ScoringOptions> = {}) {
    this.timeline = timeline
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.hit = timeline.notes.map(() => 0)
    this.totalWeight = timeline.notes.reduce((sum, n) => sum + WEIGHT[n.kind] * (n.end - n.start), 0)
  }

  /** The note being sung at `time`, if any. Frames arrive in time order, so we keep a cursor. */
  noteAt(time: number): TimedNote | null {
    const notes = this.timeline.notes
    while (this.cursor < notes.length && notes[this.cursor].end <= time) this.cursor++
    const note = notes[this.cursor]
    return note && note.start <= time ? note : null
  }

  /**
   * One analysed frame of the singer's voice.
   * `time` is song time in seconds (already corrected for mic delay), `dt` the frame length.
   */
  addFrame(time: number, midi: number | null, clarity: number, level: number, dt: number): boolean {
    const note = this.noteAt(time)
    if (!note || note.kind === 'freestyle') return false
    const index = this.timeline.notes.indexOf(note, this.cursor)
    let onTarget: boolean
    if (note.kind === 'rap' || note.kind === 'rap_golden') {
      onTarget = level >= this.options.minLevel
    } else {
      onTarget = midi !== null && clarity >= this.options.minClarity && level >= this.options.minLevel &&
        pitchClassDistance(midi, note.midi) <= this.options.tolerance
    }
    if (onTarget) this.hit[index] += Math.min(dt, 0.05)
    return onTarget
  }

  /** 0..1: how much of a note was sung on pitch. */
  noteFraction(index: number): number {
    const note = this.timeline.notes[index]
    const length = note.end - note.start
    return length > 0 ? Math.min(1, this.hit[index] / (length * FULL_CREDIT)) : 0
  }

  /** 0..1: weighted share of a line's notes that were hit. */
  lineFraction(line: number): number {
    let got = 0
    let possible = 0
    this.timeline.notes.forEach((note, i) => {
      if (note.line !== line) return
      const w = WEIGHT[note.kind] * (note.end - note.start)
      got += this.noteFraction(i) * w
      possible += w
    })
    return possible > 0 ? got / possible : 1
  }

  /** Total so far, 0..10000. Line bonuses count only for lines that have ended. */
  total(time = Infinity): number {
    let got = 0
    this.timeline.notes.forEach((note, i) => {
      got += this.noteFraction(i) * WEIGHT[note.kind] * (note.end - note.start)
    })
    const notes = this.totalWeight > 0 ? (got / this.totalWeight) * NOTE_POINTS : NOTE_POINTS
    const perLine = LINE_POINTS / Math.max(1, this.timeline.lines.length)
    let bonus = 0
    this.timeline.lines.forEach((line, i) => {
      if (line.end <= time) bonus += perLine * Math.min(1, this.lineFraction(i) / 0.8)
    })
    return Math.round(Math.min(NOTE_POINTS, notes) + bonus)
  }
}
