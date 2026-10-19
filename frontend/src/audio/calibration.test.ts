import { describe, expect, it } from 'vitest'
import { analyzeCalibration, beatTimes, type LevelFrame } from './calibration'

function recording(delays: (number | null)[], beats: number[], noise = 0.004, seed = 9): LevelFrame[] {
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const frames: LevelFrame[] = []
  for (let t = beats[0] - 500; t < beats[beats.length - 1] + 600; t += 5) {
    let level = noise * (0.5 + rnd())
    beats.forEach((beat, i) => {
      const d = delays[i]
      if (d !== null && t >= beat + d && t < beat + d + 120) level = 0.2
    })
    frames.push({ t, level })
  }
  return frames
}

describe('analyzeCalibration', () => {
  const beats = beatTimes(10_000)

  it('finds a steady delay', () => {
    const result = analyzeCalibration(recording(beats.map(() => 140), beats), beats)
    expect(result).not.toBeNull()
    expect(Math.abs(result!.latencyMs - 140)).toBeLessThanOrEqual(5)
    expect(result!.detected).toBe(8)
    expect(result!.spreadMs).toBeLessThanOrEqual(5)
  })

  it('takes the typical delay when the timing wobbles', () => {
    const delays = [120, 160, 135, 150, 400, 140, 130, 145] // one very late "ta"
    const result = analyzeCalibration(recording(delays, beats), beats)
    expect(result!.latencyMs).toBeGreaterThanOrEqual(135)
    expect(result!.latencyMs).toBeLessThanOrEqual(150)
  })

  it('copes with a few missed beats', () => {
    const delays = [100, null, 105, null, 95, 100, null, 110]
    expect(analyzeCalibration(recording(delays, beats), beats)!.detected).toBe(5)
  })

  it('gives up when nothing was heard', () => {
    expect(analyzeCalibration(recording(beats.map(() => null), beats), beats)).toBeNull()
    expect(analyzeCalibration([], beats)).toBeNull()
  })

  it('accepts a clap slightly before the beat', () => {
    const result = analyzeCalibration(recording(beats.map(() => -30), beats), beats)
    expect(Math.abs(result!.latencyMs - -30)).toBeLessThanOrEqual(5)
  })
})

describe('beatTimes', () => {
  it('spaces beats evenly', () => {
    expect(beatTimes(1000, 3, 500)).toEqual([1000, 1500, 2000])
  })
})
