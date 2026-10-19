// Runs on the browser's audio thread. Every ~10 ms it analyses the last ~43 ms of
// microphone audio and posts {time, hz, clarity, level} to the page.
//
// Loaded with audioWorklet.addModule(); Vite bundles it (see engine.ts).

import { downsample2, rms, yin } from './yin'

// The AudioWorklet global scope isn't part of the DOM type library.
declare const sampleRate: number
declare const currentTime: number
declare function registerProcessor(name: string, processor: unknown): void
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}

const WINDOW = 2048 // samples analysed at a time (about 43 ms at 48 kHz)

class MicAnalyzer extends AudioWorkletProcessor {
  private buffer = new Float32Array(WINDOW)
  private filled = 0
  private sinceLast = 0
  private hop = Math.round(sampleRate / 94) // about 94 analyses per second

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0]
    if (!input) return true

    // Keep the most recent WINDOW samples.
    const n = input.length
    this.buffer.copyWithin(0, n)
    this.buffer.set(input, WINDOW - n)
    this.filled = Math.min(WINDOW, this.filled + n)
    this.sinceLast += n

    if (this.filled === WINDOW && this.sinceLast >= this.hop) {
      this.sinceLast = 0
      const { hz, clarity } = yin(downsample2(this.buffer), sampleRate / 2)
      // Context time of the middle of the analysed window.
      const time = currentTime + n / sampleRate - WINDOW / 2 / sampleRate
      this.port.postMessage({ time, hz, clarity, level: rms(this.buffer) })
    }
    return true
  }
}

registerProcessor('mic-analyzer', MicAnalyzer)
