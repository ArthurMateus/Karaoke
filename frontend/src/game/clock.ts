// Clock sync, NTP style. The phone sends ping{t0}; the server answers with its time;
// the reply arrives at t2. If the network is symmetric, the server read its clock
// halfway through, so offset = serverTime - (t0 + t2) / 2. Network delays are noisy,
// so we keep many samples and trust the ones with the shortest round trip.

/** This device's clock in milliseconds since 1970, with sub-millisecond precision. */
export function wallNow(): number {
  return performance.timeOrigin + performance.now()
}

export interface ClockSample {
  offset: number // server clock minus this device's clock, ms
  rtt: number // round-trip time, ms
}

export function sampleFromPong(t0: number, serverTime: number, t2: number): ClockSample {
  return { offset: serverTime - (t0 + t2) / 2, rtt: t2 - t0 }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export class ClockSync {
  private samples: ClockSample[] = []
  private readonly keep: number

  constructor(keep = 30) {
    this.keep = keep
  }

  add(sample: ClockSample): void {
    if (!Number.isFinite(sample.offset) || sample.rtt < 0) return
    this.samples.push(sample)
    if (this.samples.length > this.keep) this.samples.shift()
  }

  get count(): number {
    return this.samples.length
  }

  /** Enough samples to start a song in sync. */
  get ready(): boolean {
    return this.samples.length >= 5
  }

  /** Median offset of the fastest third of samples (null until there is one). */
  get offset(): number | null {
    if (this.samples.length === 0) return null
    const fastest = [...this.samples].sort((a, b) => a.rtt - b.rtt)
    return median(fastest.slice(0, Math.max(1, Math.ceil(fastest.length / 3))).map((s) => s.offset))
  }

  /** Worst-case error of the estimate is about half the best round trip. */
  get uncertaintyMs(): number | null {
    if (this.samples.length === 0) return null
    return Math.min(...this.samples.map((s) => s.rtt)) / 2
  }

  /** Server time now. */
  serverNow(localNow: number = wallNow()): number {
    return localNow + (this.offset ?? 0)
  }

  /** This device's clock reading for a moment in server time. */
  toLocal(serverTime: number): number {
    return serverTime - (this.offset ?? 0)
  }
}
