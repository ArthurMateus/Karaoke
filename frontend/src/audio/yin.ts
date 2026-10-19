// YIN pitch detection (de Cheveigné & Kawahara, 2002). Pure functions, so they
// run both in tests and inside the microphone AudioWorklet.

export interface PitchResult {
  hz: number // 0 when no clear pitch
  clarity: number // 0..1, how periodic the sound is
}

/**
 * Detect the fundamental frequency of `buffer`.
 * minHz/maxHz bound the search to the human singing range.
 */
export function yin(buffer: Float32Array, sampleRate: number, minHz = 65, maxHz = 1000, threshold = 0.15): PitchResult {
  const maxTau = Math.min(Math.floor(sampleRate / minHz), Math.floor(buffer.length / 2))
  const minTau = Math.max(2, Math.floor(sampleRate / maxHz))
  const width = buffer.length - maxTau
  if (maxTau <= minTau || width <= 0) return { hz: 0, clarity: 0 }

  // Difference function and its cumulative mean normalisation, in one pass.
  const d = new Float32Array(maxTau + 1)
  d[0] = 1
  let runningSum = 0
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0
    for (let i = 0; i < width; i++) {
      const delta = buffer[i] - buffer[i + tau]
      sum += delta * delta
    }
    runningSum += sum
    d[tau] = runningSum === 0 ? 1 : (sum * tau) / runningSum
  }

  // First dip below the threshold, then follow it down to its local minimum.
  let tau = -1
  for (let t = minTau; t <= maxTau; t++) {
    if (d[t] < threshold) {
      while (t + 1 <= maxTau && d[t + 1] < d[t]) t++
      tau = t
      break
    }
  }
  if (tau === -1) {
    // No confident dip: report the best one anyway, with its (low) clarity.
    let best = minTau
    for (let t = minTau + 1; t <= maxTau; t++) if (d[t] < d[best]) best = t
    return { hz: 0, clarity: Math.max(0, 1 - d[best]) }
  }

  // Parabolic interpolation around the minimum for sub-sample accuracy.
  let refined = tau
  if (tau > 1 && tau < maxTau) {
    const a = d[tau - 1], b = d[tau], c = d[tau + 1]
    const denominator = a - 2 * b + c
    if (denominator !== 0) refined = tau + (a - c) / (2 * denominator)
  }
  return { hz: sampleRate / refined, clarity: Math.max(0, Math.min(1, 1 - d[tau])) }
}

/** Halve the sample rate (average neighbouring samples). Makes YIN 4x cheaper on phones. */
export function downsample2(input: Float32Array): Float32Array {
  const out = new Float32Array(Math.floor(input.length / 2))
  for (let i = 0; i < out.length; i++) out[i] = (input[2 * i] + input[2 * i + 1]) / 2
  return out
}

export function rms(buffer: Float32Array): number {
  let sum = 0
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i]
  return Math.sqrt(sum / Math.max(1, buffer.length))
}

export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440)
}
