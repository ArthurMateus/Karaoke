import { describe, expect, it } from 'vitest'
import { liveStandings, placeAll, placesBefore } from './ranking'

describe('placeAll', () => {
  it('sorts by score and shares places on a tie', () => {
    const rows = placeAll([{ id: 'a', score: 8 }, { id: 'b', score: 10 }, { id: 'c', score: 10 }])
    expect(rows.map((r) => [r.id, r.place])).toEqual([['b', 1], ['c', 1], ['a', 3]])
  })
})

describe('placesBefore', () => {
  it('takes the turn back out of the singer average', () => {
    // Ana: turns 9000 and 5000 -> 7000; Bo: one turn of 8000.
    const now = [
      { id: 'bo', points: 8000, turns: 1 },
      { id: 'ana', points: 7000, turns: 2 },
    ]
    const before = placesBefore(now, ['ana'], { ana: 5000 })
    expect(before.get('ana')).toBe(1) // 9000 before this turn
    expect(before.get('bo')).toBe(2)
  })
  it('leaves a first-time singer off the old board', () => {
    const before = placesBefore([{ id: 'ana', points: 9000, turns: 1 }, { id: 'bo', points: 8000, turns: 1 }], ['ana'], { ana: 9000 })
    expect(before.has('ana')).toBe(false)
    expect(before.get('bo')).toBe(1)
  })
})

describe('liveStandings', () => {
  it('redoes the singer average with the newest turn points', () => {
    // Sent while Bo's turn counted 10000 (no votes yet); now the votes make it 7600.
    const sent = [{ id: 'bo', points: 10000, turns: 1 }, { id: 'ana', points: 9000, turns: 1 }]
    const rows = liveStandings(sent, { bo: 10000 }, { bo: 7600 })
    expect(rows.map((r) => [r.id, r.points])).toEqual([['ana', 9000], ['bo', 7600]])
  })
})
