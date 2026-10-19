// Microphone delay calibration.
//
// We play a click every 0.6 s and the player says "ta" (or claps) on each click.
// With speakers, the mic also hears the clicks themselves. Either way, the delay
// between when a click is heard and when the mic analysis sees a sound is what we
// need to line up the singer's voice with the song, for scoring and for replays.

export interface LevelFrame {
  t: number // device clock, ms, when the analysed audio was captured (before correction)
  level: number // RMS
}

export interface CalibrationResult {
  latencyMs: number
  spreadMs: number // how consistent the beats were
  detected: number // beats with a clear sound
}

const STORAGE_KEY = 'kp_mic_latency_ms'
export const DEFAULT_LATENCY_MS = 120

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Times (device clock, ms) when the clicks should be heard. */
export function beatTimes(firstBeat: number, count = 8, intervalMs = 600): number[] {
  return Array.from({ length: count }, (_, i) => firstBeat + i * intervalMs)
}

/**
 * Find the sound that answers each beat and return the typical delay.
 * Returns null when too few beats got a clear answer (too quiet, too noisy).
 */
export function analyzeCalibration(frames: LevelFrame[], beats: number[], minBeats = 4): CalibrationResult | null {
  if (frames.length === 0 || beats.length === 0) return null
  // Background level: the quietest part of the recording.
  const levels = frames.map((f) => f.level).sort((a, b) => a - b)
  const floor = levels[Math.floor(levels.length * 0.2)]
  const threshold = Math.max(floor * 4, floor + 0.015)

  const delays: number[] = []
  for (const beat of beats) {
    // A sound starting between 60 ms early (an eager clap) and 450 ms late.
    for (let i = 1; i < frames.length; i++) {
      const frame = frames[i]
      if (frame.t < beat - 60) continue
      if (frame.t > beat + 450) break
      if (frame.level >= threshold && frames[i - 1].level < threshold) {
        delays.push(frame.t - beat)
        break
      }
    }
  }
  if (delays.length < minBeats) return null
  const latency = median(delays)
  const spread = median(delays.map((d) => Math.abs(d - latency)))
  return { latencyMs: Math.round(latency), spreadMs: Math.round(spread), detected: delays.length }
}

export function savedLatency(): number | null {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY))
    return localStorage.getItem(STORAGE_KEY) !== null && Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

export function saveLatency(ms: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(Math.round(ms)))
  } catch {
    // private mode: keep it for this session only
  }
}
