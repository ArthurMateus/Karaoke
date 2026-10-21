import { describe, expect, it } from 'vitest'
import { impulseResponse } from './monitor'

function seeded(seed = 7) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
}

describe('impulseResponse', () => {
  it('has the asked length and channels', () => {
    const ir = impulseResponse(48000, 0.5, 3, 2, seeded())
    expect(ir).toHaveLength(2)
    expect(ir[0]).toHaveLength(24000)
    expect(ir[1]).toHaveLength(24000)
  })

  it('stays within -1..1 and fades out', () => {
    const [data] = impulseResponse(48000, 1, 2.5, 1, seeded())
    const energy = (from: number, to: number) => data.slice(from, to).reduce((sum, v) => sum + v * v, 0)
    expect(Math.max(...data.map(Math.abs))).toBeLessThanOrEqual(1)
    expect(energy(0, 4800)).toBeGreaterThan(energy(19200, 24000) * 5)
    expect(energy(43200, 48000)).toBeLessThan(energy(0, 4800) / 100)
    expect(Math.abs(data[data.length - 1])).toBeLessThan(1e-6)
  })

  it('never makes an empty buffer', () => {
    expect(impulseResponse(8000, 0, 2, 1)[0]).toHaveLength(1)
  })
})
