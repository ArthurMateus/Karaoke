// "Hear yourself": the voice sent straight to the speakers/headphones, with an optional
// reverb or echo. It is a side branch of the audio graph: it listens to the same mic node
// as the analyser but feeds only the output, never the analyser, the recording or the
// live voice (those use the mic or its raw stream directly).
//
//   mic node ──> analyser (unchanged)
//            └─> input ─┬─> dry ─────────────┐
//                       └─> effect ─> wet ───┴─> level ─> speakers
//
// It runs in the engine's own AudioContext (latencyHint "interactive"), so the only delay
// is the browser's input + output buffering.

import type { MonitorEffect, MonitorPrefs } from '../game/singPrefs'

/**
 * A made-up reverb "echo of a room": noise that dies away. `seconds` sets the room size,
 * `decay` how fast it fades (bigger = faster). `random` is passed in so tests are repeatable.
 */
export function impulseResponse(sampleRate: number, seconds: number, decay: number, channels = 2, random: () => number = Math.random): Float32Array[] {
  const length = Math.max(1, Math.round(sampleRate * seconds))
  const out: Float32Array[] = []
  for (let c = 0; c < channels; c++) {
    const data = new Float32Array(length)
    for (let i = 0; i < length; i++) data[i] = (random() * 2 - 1) * (1 - i / length) ** decay
    out.push(data)
  }
  return out
}

const ROOMS: Record<'room' | 'hall', { seconds: number; decay: number }> = {
  room: { seconds: 0.7, decay: 3.5 },
  hall: { seconds: 2.6, decay: 2.2 },
}
const ECHO_SECONDS = 0.32
const ECHO_FEEDBACK = 0.38
const RAMP = 0.03 // seconds: smooth level changes, no clicks

export class Monitor {
  private readonly ctx: AudioContext
  private readonly source: AudioNode
  private readonly input: GainNode
  private readonly wet: GainNode
  private readonly level: GainNode
  private effectNodes: AudioNode[] = []
  private effect: MonitorEffect | null = null
  private readonly irs = new Map<'room' | 'hall', AudioBuffer>()

  constructor(ctx: AudioContext, source: AudioNode) {
    this.ctx = ctx
    this.source = source
    this.input = ctx.createGain()
    this.wet = ctx.createGain()
    this.level = ctx.createGain()
    this.level.gain.value = 0
    this.input.connect(this.level) // dry
    this.wet.connect(this.level)
    this.level.connect(ctx.destination)
    source.connect(this.input)
  }

  set(prefs: MonitorPrefs): void {
    const now = this.ctx.currentTime
    this.level.gain.setTargetAtTime(prefs.level, now, RAMP)
    this.wet.gain.setTargetAtTime(prefs.effect === 'off' ? 0 : prefs.wet, now, RAMP)
    if (prefs.effect !== this.effect) this.useEffect(prefs.effect)
  }

  private useEffect(effect: MonitorEffect): void {
    this.effectNodes.forEach((node) => node.disconnect())
    this.effectNodes = []
    this.effect = effect
    if (effect === 'off') return
    if (effect === 'echo') {
      const delay = this.ctx.createDelay(1)
      delay.delayTime.value = ECHO_SECONDS
      const feedback = this.ctx.createGain()
      feedback.gain.value = ECHO_FEEDBACK
      const tone = this.ctx.createBiquadFilter() // each repeat a little darker, like a tape echo
      tone.type = 'lowpass'
      tone.frequency.value = 3500
      this.input.connect(delay)
      delay.connect(tone)
      tone.connect(feedback)
      feedback.connect(delay)
      tone.connect(this.wet)
      this.effectNodes = [delay, tone, feedback]
      return
    }
    const convolver = this.ctx.createConvolver()
    convolver.buffer = this.impulse(effect)
    this.input.connect(convolver)
    convolver.connect(this.wet)
    this.effectNodes = [convolver]
  }

  private impulse(kind: 'room' | 'hall'): AudioBuffer {
    let buffer = this.irs.get(kind)
    if (!buffer) {
      const { seconds, decay } = ROOMS[kind]
      const channels = impulseResponse(this.ctx.sampleRate, seconds, decay)
      buffer = this.ctx.createBuffer(channels.length, channels[0].length, this.ctx.sampleRate)
      channels.forEach((data, c) => buffer!.copyToChannel(data as Float32Array<ArrayBuffer>, c))
      this.irs.set(kind, buffer)
    }
    return buffer
  }

  /** Disconnect everything; the mic node itself keeps feeding the analyser. */
  close(): void {
    try {
      this.source.disconnect(this.input)
    } catch {
      // already disconnected
    }
    this.effectNodes.forEach((node) => node.disconnect())
    this.input.disconnect()
    this.wet.disconnect()
    this.level.disconnect()
  }
}
