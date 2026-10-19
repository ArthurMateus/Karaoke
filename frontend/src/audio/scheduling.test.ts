import { describe, expect, it } from 'vitest'
import { contextTimeFor, frameWallTime, heardAnchor, startPlan } from './scheduling'

describe('heardAnchor', () => {
  it('uses the output timestamp when the browser has one', () => {
    const ctx = { currentTime: 10.2, getOutputTimestamp: () => ({ contextTime: 10.1, performanceTime: 5000 }) }
    expect(heardAnchor(ctx, 1_000_000, 5050)).toEqual({ contextTime: 10.1, wallMs: 1_005_000 })
  })

  it('falls back to the reported output latency', () => {
    const ctx = { currentTime: 10, outputLatency: 0.04 }
    expect(heardAnchor(ctx, 1_000_000, 5000)).toEqual({ contextTime: 9.96, wallMs: 1_005_000 })
  })

  it('ignores an empty output timestamp (before audio starts)', () => {
    const ctx = { currentTime: 1, baseLatency: 0.01, getOutputTimestamp: () => ({ contextTime: 0, performanceTime: 0 }) }
    expect(heardAnchor(ctx, 0, 100).contextTime).toBeCloseTo(0.99)
  })
})

describe('contextTimeFor', () => {
  it('maps a future device-clock moment to context time', () => {
    const anchor = { contextTime: 10, wallMs: 1_000_000 }
    expect(contextTimeFor(1_002_500, anchor)).toBe(12.5)
  })
})

describe('frameWallTime', () => {
  it('dates a microphone frame on the device clock', () => {
    expect(frameWallTime(9.9, 10, 1_000_000)).toBeCloseTo(999_900)
  })
})

describe('startPlan', () => {
  const anchor = { contextTime: 10, wallMs: 1_000_000 }

  it('starts on time when there is time', () => {
    expect(startPlan(1_003_000, anchor, 10.5)).toEqual([13, 0])
  })

  it('jumps into the track when we are late', () => {
    const [when, offset] = startPlan(1_001_000, anchor, 12)
    expect(when).toBeCloseTo(12.05)
    expect(offset).toBeCloseTo(1.05) // the song has been going for 1.05 s by then
  })
})
