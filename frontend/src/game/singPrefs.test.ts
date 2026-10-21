import { describe, expect, it } from 'vitest'
import { DEFAULT_MONITOR, parseMonitor, parseView } from './singPrefs'

describe('sing prefs', () => {
  it('starts in the Advanced view with the monitor off', () => {
    expect(parseView(null)).toBe('advanced')
    expect(parseView('weird')).toBe('advanced')
    expect(parseView('simple')).toBe('simple')
    expect(parseMonitor(null)).toEqual(DEFAULT_MONITOR)
    expect(DEFAULT_MONITOR.on).toBe(false)
    expect(DEFAULT_MONITOR.effect).toBe('off')
  })

  it('reads back what was saved', () => {
    const saved = { on: true, level: 0.5, effect: 'hall', wet: 0.6 }
    expect(parseMonitor(JSON.stringify(saved))).toEqual(saved)
  })

  it('falls back on broken values', () => {
    expect(parseMonitor('{not json')).toEqual(DEFAULT_MONITOR)
    expect(parseMonitor('null')).toEqual(DEFAULT_MONITOR)
    expect(parseMonitor(JSON.stringify({ on: 'yes', level: 7, effect: 'chorus', wet: -1 }))).toEqual({
      on: false,
      level: 1,
      effect: 'off',
      wet: 0,
    })
  })
})
