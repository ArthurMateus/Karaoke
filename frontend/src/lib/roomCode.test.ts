import { describe, expect, it } from 'vitest'
import { CODE_ALPHABET, formatCode, normalizeCode } from './roomCode'

describe('normalizeCode', () => {
  it.each([
    ['abc234', 'ABC234'],
    [' abc-234 ', 'ABC234'],
    ['ABC 234', 'ABC234'],
  ])('accepts %j', (raw, expected) => {
    expect(normalizeCode(raw)).toBe(expected)
  })

  it.each(['', 'ABC23', 'ABC2345', 'ABC2O4', 'ABC1I4', 'ABÇ234'])('rejects %j', (raw) => {
    expect(normalizeCode(raw)).toBeNull()
  })

  it('uses no look-alike characters', () => {
    for (const ch of '01OIL') expect(CODE_ALPHABET).not.toContain(ch)
  })
})

describe('formatCode', () => {
  it('splits the code in two halves', () => {
    expect(formatCode('ABC234')).toBe('ABC 234')
  })
})
