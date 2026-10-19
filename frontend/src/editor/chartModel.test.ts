import { describe, expect, it } from 'vitest'
import {
  beatToSeconds,
  breakLineAt,
  deleteNote,
  findProblems,
  formatTime,
  isDuet,
  joinWithNextLine,
  lineAtBeat,
  lineText,
  mergeWithNext,
  moveNote,
  pitchName,
  resizeNote,
  secondsToBeat,
  setSinger,
  shiftLine,
  splitNote,
  updateNote,
  type EditorChart,
  type EditorNote,
} from './chartModel'

const n = (start: number, length: number, pitch: number, text: string): EditorNote => ({ kind: 'normal', start, length, pitch, text })

function chart(): EditorChart {
  return {
    title: 'T',
    artist: 'A',
    language: 'en',
    bpm: 300,
    gap_ms: 2000,
    singers: {},
    lines: [
      { singer: 'P1', notes: [n(0, 4, 0, 'Twin'), n(4, 4, 0, 'kle'), n(8, 8, 7, ' star')] },
      { singer: 'P1', notes: [n(20, 4, 5, 'How'), n(24, 4, 4, ' I')] },
    ],
  }
}

describe('time', () => {
  it('converts beats and seconds both ways', () => {
    expect(beatToSeconds(chart(), 0)).toBe(2)
    expect(beatToSeconds(chart(), 20)).toBeCloseTo(3) // 50 ms per beat at BPM 300
    expect(secondsToBeat(chart(), 3)).toBeCloseTo(20)
  })

  it('names pitches', () => {
    expect(pitchName(0)).toBe('C4')
    expect(pitchName(-5)).toBe('G3')
    expect(pitchName(13)).toBe('C#5')
  })

  it('formats time', () => {
    expect(formatTime(72.34)).toBe('1:12.3')
    expect(formatTime(5)).toBe('0:05.0')
  })

  it('finds the line being sung', () => {
    expect(lineAtBeat(chart(), 0)).toBe(0)
    expect(lineAtBeat(chart(), 15)).toBe(1) // shortly before line 2 starts
  })
})

describe('reading', () => {
  it('joins syllables into text', () => {
    const c = chart()
    c.lines[0].notes.push(n(16, 2, 5, '~'))
    expect(lineText(c.lines[0])).toBe('Twinkle star')
  })
})

describe('editing', () => {
  it('never changes the original chart', () => {
    const original = chart()
    const copy = structuredClone(original)
    moveNote(original, 0, 0, 2, 1)
    splitNote(original, 0, 2)
    expect(original).toEqual(copy)
  })

  it('moves and resizes notes, clamping to valid values', () => {
    let c = moveNote(chart(), 0, 2, 1, 2)
    expect(c.lines[0].notes[2]).toMatchObject({ start: 9, pitch: 9 })
    c = resizeNote(c, 0, 2, -20)
    expect(c.lines[0].notes[2].length).toBe(1)
    c = moveNote(c, 0, 0, -10, -100)
    expect(c.lines[0].notes[0]).toMatchObject({ start: 0, pitch: -48 })
  })

  it('keeps notes sorted after moving one past another', () => {
    const c = moveNote(chart(), 0, 0, 10, 0)
    expect(c.lines[0].notes.map((x) => x.text)).toEqual(['kle', ' star', 'Twin'])
  })

  it('splits a note into a held syllable', () => {
    const c = splitNote(chart(), 0, 2)
    expect(c.lines[0].notes.slice(2)).toEqual([n(8, 4, 7, ' star'), n(12, 4, 7, '~')])
  })

  it('merges notes and their text', () => {
    const c = mergeWithNext(chart(), 0, 0)
    expect(c.lines[0].notes[0]).toEqual(n(0, 8, 0, 'Twinkle'))
    expect(mergeWithNext(splitNote(chart(), 0, 2), 0, 2).lines[0].notes[2]).toEqual(n(8, 8, 7, ' star'))
  })

  it('deletes notes and drops lines that become empty', () => {
    let c = deleteNote(chart(), 1, 0)
    c = deleteNote(c, 1, 0)
    expect(c.lines).toHaveLength(1)
  })

  it('breaks and joins lines', () => {
    const broken = breakLineAt(chart(), 0, 2)
    expect(broken.lines.map(lineText)).toEqual(['Twinkle', 'star', 'How I'])
    expect(broken.lines[1].notes[0].text).toBe('star') // no leading space at a line start
    const joined = joinWithNextLine(broken, 0)
    expect(joined.lines.map(lineText)).toEqual(['Twinkle star', 'How I'])
  })

  it('shifts a whole line', () => {
    const c = shiftLine(chart(), 1, -4)
    expect(c.lines[1].notes.map((x) => x.start)).toEqual([16, 20])
  })

  it('turns a song into a duet by assigning lines', () => {
    expect(isDuet(chart())).toBe(false)
    expect(isDuet(setSinger(chart(), 1, 'P2'))).toBe(true)
  })
})

describe('findProblems', () => {
  it('is happy with a good chart', () => {
    expect(findProblems(chart())).toEqual([])
  })

  it('finds overlapping notes, even across lines', () => {
    const c = updateNote(chart(), 1, 0, { start: 14 })
    expect(findProblems(c)).toEqual([{ code: 'overlap', line: 1, note: 0 }])
  })

  it('lets two singers overlap, but not "both" with either', () => {
    let c = updateNote(chart(), 1, 0, { start: 14 })
    c = setSinger(c, 1, 'P2')
    expect(findProblems(c)).toEqual([])
    c = setSinger(c, 0, 'both')
    expect(findProblems(c).map((p) => p.code)).toEqual(['overlap'])
  })

  it('finds empty lyrics', () => {
    const c = updateNote(chart(), 0, 1, { text: ' ' })
    expect(findProblems(c)).toEqual([{ code: 'empty_text', line: 0, note: 1 }])
  })
})
