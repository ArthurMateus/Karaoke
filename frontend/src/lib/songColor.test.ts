import { describe, expect, it } from 'vitest'
import { coverLetters, coverNotes, songHue } from './songColor'

describe('song covers', () => {
  it('give each song a stable hue', () => {
    const id = '8d1f6c2e-0b6a-4a51-9a39-2f1d1c3b5a77'
    expect(songHue(id)).toBe(songHue(id))
    expect(songHue(id)).toBeGreaterThanOrEqual(0)
    expect(songHue(id)).toBeLessThan(360)
    expect(songHue('another-song')).not.toBe(songHue(id))
  })

  it('take the first letters of the first two words', () => {
    expect(coverLetters('Row, Row, Row Your Boat')).toBe('RR')
    expect(coverLetters('Twinkle')).toBe('T')
    expect(coverLetters('Dorme, João?')).toBe('DJ')
    expect(coverLetters('…')).toBe('')
  })

  it('draw the same notes for the same song, inside the cover', () => {
    const notes = coverNotes('abc')
    expect(coverNotes('abc')).toEqual(notes)
    expect(notes.length).toBeGreaterThan(2)
    for (const [x, y, w] of notes) {
      expect(x + w).toBeLessThanOrEqual(62)
      expect(y).toBeGreaterThanOrEqual(22)
      expect(y).toBeLessThanOrEqual(50)
    }
  })
})
