import { describe, expect, it } from 'vitest'
import { downsample2, hzToMidi, rms, yin } from './yin'

const RATE = 24000 // what the worklet analyses after halving 48 kHz

function tone(hz: number, harmonics: number[] = [1], length = 1024, rate = RATE): Float32Array {
  const out = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    out[i] = harmonics.reduce((sum, amp, h) => sum + amp * Math.sin((2 * Math.PI * hz * (h + 1) * i) / rate), 0)
  }
  return out
}

function noise(length = 1024, seed = 3): Float32Array {
  const out = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    seed = (seed * 16807) % 2147483647
    out[i] = (seed / 2147483647) * 2 - 1
  }
  return out
}

describe('yin', () => {
  it.each([82.4, 110, 196, 261.6, 440, 659.3, 880])('finds a %d Hz sine within 0.5%%', (hz) => {
    const result = yin(tone(hz, [1], 2048), RATE)
    expect(Math.abs(result.hz - hz) / hz).toBeLessThan(0.005)
    expect(result.clarity).toBeGreaterThan(0.9)
  })

  it('finds the fundamental of a voice-like sound with a strong second harmonic', () => {
    const result = yin(tone(220, [0.6, 1, 0.5, 0.3]), RATE)
    expect(Math.abs(hzToMidi(result.hz) - hzToMidi(220))).toBeLessThan(0.2)
  })

  it('reports no pitch for noise and silence', () => {
    expect(yin(noise(), RATE).hz).toBe(0)
    expect(yin(noise(), RATE).clarity).toBeLessThan(0.6)
    expect(yin(new Float32Array(1024), RATE).hz).toBe(0)
  })

  it('returns nothing for buffers too short to analyse', () => {
    expect(yin(new Float32Array(10), RATE)).toEqual({ hz: 0, clarity: 0 })
  })
})

describe('helpers', () => {
  it('downsamples by averaging pairs', () => {
    expect(Array.from(downsample2(new Float32Array([1, 3, 5, 7, 9])))).toEqual([2, 6])
  })

  it('downsampled audio keeps its pitch', () => {
    const full = tone(330, [1], 2048, 48000)
    expect(Math.abs(yin(downsample2(full), 24000).hz - 330)).toBeLessThan(2)
  })

  it('computes loudness and midi numbers', () => {
    expect(rms(new Float32Array([1, -1, 1, -1]))).toBe(1)
    expect(hzToMidi(440)).toBe(69)
    expect(hzToMidi(261.6256)).toBeCloseTo(60, 3)
  })
})
