import { describe, expect, it } from 'vitest'
import { formatTimeLeft } from './hooks'

describe('formatTimeLeft', () => {
  it('shows hours only when there are some', () => {
    expect(formatTimeLeft(65_000)).toBe('1:05')
    expect(formatTimeLeft(3_725_000)).toBe('1:02:05')
    expect(formatTimeLeft(0)).toBe('0:00')
    expect(formatTimeLeft(-5)).toBe('0:00')
  })

  it('rounds up, so it never shows 0:00 early', () => {
    expect(formatTimeLeft(400)).toBe('0:01')
  })
})
