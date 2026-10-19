import { describe, expect, it } from 'vitest'
import { ClockSync, sampleFromPong } from './clock'

// Simulate a server whose clock runs `trueOffset` ms ahead, over a jittery network.
function simulate(trueOffset: number, rng: () => number, pings = 20) {
  const sync = new ClockSync()
  let local = 1_000_000
  for (let i = 0; i < pings; i++) {
    const up = 20 + rng() * 120 // ms to reach the server
    const down = 20 + rng() * 120 // ms back
    const t0 = local
    const serverTime = t0 + up + trueOffset
    const t2 = t0 + up + down
    sync.add(sampleFromPong(t0, serverTime, t2))
    local = t2 + 100
  }
  return sync
}

function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
}

describe('sampleFromPong', () => {
  it('is exact on a symmetric network', () => {
    expect(sampleFromPong(1000, 6050, 1100)).toEqual({ offset: 5000, rtt: 100 })
  })
})

describe('ClockSync', () => {
  it('estimates the offset within a few ms despite jitter', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const sync = simulate(-37_000, seeded(seed))
      expect(Math.abs(sync.offset! - -37_000)).toBeLessThan(25)
    }
  })

  it('is ready after five samples and converts both ways', () => {
    const sync = new ClockSync()
    for (let i = 0; i < 4; i++) sync.add({ offset: 500, rtt: 40 })
    expect(sync.ready).toBe(false)
    sync.add({ offset: 500, rtt: 40 })
    expect(sync.ready).toBe(true)
    expect(sync.serverNow(1000)).toBe(1500)
    expect(sync.toLocal(1500)).toBe(1000)
    expect(sync.uncertaintyMs).toBe(20)
  })

  it('trusts fast round trips over slow ones', () => {
    const sync = new ClockSync()
    sync.add({ offset: 100, rtt: 30 })
    sync.add({ offset: 100, rtt: 35 })
    for (let i = 0; i < 4; i++) sync.add({ offset: 400, rtt: 600 }) // congested, skewed samples
    expect(sync.offset).toBe(100)
  })

  it('keeps only recent samples and ignores garbage', () => {
    const sync = new ClockSync(3)
    sync.add({ offset: NaN, rtt: 10 })
    sync.add({ offset: 1, rtt: -5 })
    expect(sync.count).toBe(0)
    for (const offset of [1, 2, 3, 4]) sync.add({ offset, rtt: 10 })
    expect(sync.count).toBe(3)
  })
})
