// Everything audio on the phone: the microphone and its analysis, the backing
// track started at an exact moment, calibration clicks, and the voice recording.
// Create it from a click or tap: browsers only allow audio after a user gesture.

import { wallNow } from '../game/clock'
import type { Timeline } from '../game/timeline'
import workletUrl from './micWorklet.ts?worker&url'
import { contextTimeFor, frameWallTime, heardAnchor, outputLag, startPlan } from './scheduling'

export interface MicFrame {
  t: number // device clock (ms) when this sound reached the microphone path
  hz: number
  clarity: number
  level: number
}

type FrameListener = (frame: MicFrame) => void

export class MicUnavailableError extends Error {
  code: string
  constructor(code: 'mic_denied' | 'mic_missing' | 'mic_unsupported') {
    super(code)
    this.code = code
  }
}

const RECORDER_TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm']

export class AudioEngine {
  readonly ctx: AudioContext
  private listeners = new Set<FrameListener>()
  private input: MediaStream | null = null
  private analyser: AudioWorkletNode | null = null
  private recorder: MediaRecorder | null = null
  private recordChunks: Blob[] = []
  private fakeVoice: { osc: OscillatorNode; gain: GainNode; dest: MediaStreamAudioDestinationNode } | null = null
  readonly simulated: boolean

  private constructor(ctx: AudioContext, simulated: boolean) {
    this.ctx = ctx
    this.simulated = simulated
  }

  /** Call from a click/tap handler. `simulated` replaces the mic with a robot singer (development only). */
  static async create(simulated = false): Promise<AudioEngine> {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx || !('audioWorklet' in Ctx.prototype)) throw new MicUnavailableError('mic_unsupported')
    const ctx = new Ctx({ latencyHint: 'interactive' })
    await ctx.resume()
    const engine = new AudioEngine(ctx, simulated)
    await ctx.audioWorklet.addModule(workletUrl)
    await engine.connectInput()
    return engine
  }

  private async connectInput(): Promise<void> {
    let source: AudioNode
    if (this.simulated) {
      const osc = this.ctx.createOscillator()
      osc.type = 'triangle'
      const gain = this.ctx.createGain()
      gain.gain.value = 0
      const dest = this.ctx.createMediaStreamDestination()
      osc.connect(gain)
      gain.connect(dest)
      osc.start()
      this.fakeVoice = { osc, gain, dest }
      this.input = dest.stream
      source = gain
    } else {
      if (!navigator.mediaDevices?.getUserMedia) throw new MicUnavailableError('mic_unsupported')
      try {
        // Raw voice: phone "call" processing would fight the music and smear the pitch.
        this.input = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        })
      } catch (error) {
        const name = (error as DOMException).name
        throw new MicUnavailableError(name === 'NotFoundError' ? 'mic_missing' : 'mic_denied')
      }
      source = this.ctx.createMediaStreamSource(this.input)
    }

    this.analyser = new AudioWorkletNode(this.ctx, 'mic-analyzer')
    this.analyser.port.onmessage = (event) => {
      const { time, hz, clarity, level } = event.data as { time: number; hz: number; clarity: number; level: number }
      const frame = { t: frameWallTime(time, this.ctx.currentTime, wallNow()), hz, clarity, level }
      this.listeners.forEach((listener) => listener(frame))
    }
    source.connect(this.analyser)
    // The analyser must be connected to the output to keep running; it outputs silence.
    const mute = this.ctx.createGain()
    mute.gain.value = 0
    this.analyser.connect(mute)
    mute.connect(this.ctx.destination)
  }

  onFrame(listener: FrameListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // --- playback ---

  async loadTrack(url: string): Promise<AudioBuffer> {
    const response = await fetch(url, { credentials: 'same-origin' })
    if (!response.ok) throw new Error(`audio ${response.status}`)
    return this.ctx.decodeAudioData(await response.arrayBuffer())
  }

  /** Start `buffer` so that it is heard at device-clock time `startWallMs`. Returns a stop function. */
  playAt(buffer: AudioBuffer, startWallMs: number, volume = 1): () => void {
    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    const gain = this.ctx.createGain()
    gain.gain.value = volume
    source.connect(gain)
    gain.connect(this.ctx.destination)
    const [when, offset] = startPlan(startWallMs, heardAnchor(this.ctx, performance.timeOrigin, performance.now()), this.ctx.currentTime)
    if (offset < buffer.duration) source.start(when, offset)
    return () => {
      try {
        source.stop()
      } catch {
        // already stopped
      }
    }
  }

  /** Short clicks heard at the given device-clock times (calibration). */
  playClicks(wallTimes: number[]): void {
    const anchor = heardAnchor(this.ctx, performance.timeOrigin, performance.now())
    const lag = outputLag(anchor, this.ctx.currentTime, wallNow())
    for (const t of wallTimes) {
      const when = contextTimeFor(t, anchor)
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.frequency.value = 1500
      gain.gain.setValueAtTime(0.0001, when)
      gain.gain.exponentialRampToValueAtTime(0.6, when + 0.005)
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.08)
      osc.connect(gain)
      gain.connect(this.ctx.destination)
      osc.start(when)
      osc.stop(when + 0.1)
      // The robot singer "says ta" the moment it hears the click, like a person would.
      if (this.fakeVoice) this.fakeTone(330, when + lag, 0.12)
    }
  }

  // --- the robot singer (development only) ---

  private fakeTone(hz: number, when: number, length: number): void {
    if (!this.fakeVoice) return
    const { osc, gain } = this.fakeVoice
    osc.frequency.setValueAtTime(hz, when)
    gain.gain.setValueAtTime(0.3, when)
    gain.gain.setValueAtTime(0, when + length)
  }

  /** Sing the chart's notes (an octave down, like a typical voice) starting at `startWallMs`. */
  singFake(timeline: Timeline, startWallMs: number): void {
    if (!this.fakeVoice) return
    const anchor = heardAnchor(this.ctx, performance.timeOrigin, performance.now())
    // Sing along with what the speakers play, not with what is scheduled.
    const lag = outputLag(anchor, this.ctx.currentTime, wallNow())
    for (const note of timeline.notes) {
      if (note.kind === 'freestyle') continue
      const when = contextTimeFor(startWallMs + note.start * 1000, anchor) + lag
      if (when < this.ctx.currentTime) continue
      const hz = 440 * 2 ** ((note.midi - 12 - 69) / 12)
      this.fakeTone(hz, when, Math.max(0.05, note.end - note.start - 0.03))
    }
  }

  // --- recording the singer ---

  startRecording(): Promise<number> {
    if (!this.input || typeof MediaRecorder === 'undefined') return Promise.reject(new Error('no recorder'))
    const mimeType = RECORDER_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
    this.recordChunks = []
    this.recorder = new MediaRecorder(this.input, mimeType ? { mimeType, audioBitsPerSecond: 96_000 } : undefined)
    this.recorder.ondataavailable = (event) => event.data.size > 0 && this.recordChunks.push(event.data)
    return new Promise((resolve) => {
      // Resolves with the device-clock time the recording actually started.
      this.recorder!.onstart = () => resolve(wallNow())
      this.recorder!.start(1000)
    })
  }

  stopRecording(): Promise<Blob | null> {
    const recorder = this.recorder
    if (!recorder || recorder.state === 'inactive') return Promise.resolve(null)
    return new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(this.recordChunks, { type: recorder.mimeType || 'audio/webm' }))
      recorder.stop()
    })
  }

  close(): void {
    this.input?.getTracks().forEach((track) => track.stop())
    void this.ctx.close()
  }
}
