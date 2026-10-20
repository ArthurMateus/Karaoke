import { describe, expect, it } from 'vitest'
import { voiceDelayFromStats } from './liveVoice'

const report = (...stats: Record<string, unknown>[]) => new Map(stats.map((s, i) => [String(i), s])) as unknown as RTCStatsReport

describe('voiceDelayFromStats', () => {
  it('adds the sender, the receive buffer and half the round trip', () => {
    const stats = report(
      { type: 'inbound-rtp', kind: 'audio', jitterBufferDelay: 8, jitterBufferEmittedCount: 100 }, // 80 ms
      { type: 'candidate-pair', nominated: true, currentRoundTripTime: 0.04 }, // 40 ms
    )
    expect(voiceDelayFromStats(stats)).toBe(120 + 80 + 20)
  })

  it('waits until audio has played', () => {
    expect(voiceDelayFromStats(report({ type: 'inbound-rtp', kind: 'audio', jitterBufferDelay: 0, jitterBufferEmittedCount: 0 }))).toBeNull()
    expect(voiceDelayFromStats(report())).toBeNull()
  })
})
