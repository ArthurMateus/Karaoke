// Turning "play this at that moment" into Web Audio time.
//
// An anchor pairs an AudioContext time with the device-clock moment when audio
// scheduled for that context time actually comes out of the speakers. With it,
// a sound can be scheduled to be *heard* at an exact device-clock moment.

export interface Anchor {
  contextTime: number // seconds, AudioContext clock
  wallMs: number // device clock (performance.timeOrigin + performance.now()), ms
}

export interface ContextLike {
  currentTime: number
  outputLatency?: number
  baseLatency?: number
  getOutputTimestamp?: () => AudioTimestamp
}

/** Where the output is right now. */
export function heardAnchor(ctx: ContextLike, timeOrigin: number, perfNow: number): Anchor {
  const ts = ctx.getOutputTimestamp?.()
  if (ts && ts.contextTime && ts.performanceTime) {
    // The sample at ts.contextTime was being played at ts.performanceTime.
    return { contextTime: ts.contextTime, wallMs: timeOrigin + ts.performanceTime }
  }
  // Older browsers: estimate from the reported output delay.
  const latency = ctx.outputLatency || ctx.baseLatency || 0
  return { contextTime: ctx.currentTime - latency, wallMs: timeOrigin + perfNow }
}

/** The AudioContext time to schedule at so it is heard at `wallMs`. */
export function contextTimeFor(wallMs: number, anchor: Anchor): number {
  return anchor.contextTime + (wallMs - anchor.wallMs) / 1000
}

/**
 * How far the context clock runs ahead of what the speakers play, in seconds.
 * A sound scheduled now is heard this much later.
 */
export function outputLag(anchor: Anchor, nowContextTime: number, nowWallMs: number): number {
  return Math.max(0, nowContextTime - contextTimeFor(nowWallMs, anchor))
}

/** The device-clock moment a microphone frame analysed at `frameContextTime` was captured. */
export function frameWallTime(frameContextTime: number, nowContextTime: number, nowWallMs: number): number {
  return nowWallMs - (nowContextTime - frameContextTime) * 1000
}

/**
 * Where to begin a track scheduled to start at `startWallMs`, if we are already late
 * (e.g. a phone that joined the countdown late). Returns [when, offset into the track].
 */
export function startPlan(startWallMs: number, anchor: Anchor, nowContextTime: number, safety = 0.05): [number, number] {
  const when = contextTimeFor(startWallMs, anchor)
  if (when >= nowContextTime + safety) return [when, 0]
  const at = nowContextTime + safety
  return [at, at - when]
}
