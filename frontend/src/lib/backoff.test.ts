import { describe, expect, it } from 'vitest'
import { reconnectDelayMs } from './backoff'

describe('reconnectDelayMs', () => {
  const middle = () => 0.5 // no jitter

  it('doubles each attempt', () => {
    expect([0, 1, 2, 3].map((n) => reconnectDelayMs(n, middle))).toEqual([500, 1000, 2000, 4000])
  })

  it('is capped', () => {
    expect(reconnectDelayMs(20, middle)).toBe(8000)
  })

  it('adds at most ±25% jitter', () => {
    expect(reconnectDelayMs(1, () => 0)).toBe(750)
    expect(reconnectDelayMs(1, () => 1)).toBe(1250)
  })
})
