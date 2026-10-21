// Sing screen choices remembered on this device: the view (Simple / Advanced) and
// "hear yourself" (monitor on/off, its level, the effect and how much of it).
// Everything new starts off; a broken or old stored value falls back to the defaults.

export type SingViewMode = 'simple' | 'advanced'
export type MonitorEffect = 'off' | 'room' | 'hall' | 'echo'

export interface MonitorPrefs {
  on: boolean
  level: number // 0..1, how loud the singer hears themselves
  effect: MonitorEffect
  wet: number // 0..1, how much of the effect is mixed in
}

export const MONITOR_EFFECTS: MonitorEffect[] = ['off', 'room', 'hall', 'echo']
export const DEFAULT_MONITOR: MonitorPrefs = { on: false, level: 0.8, effect: 'off', wet: 0.35 }
export const DEFAULT_VIEW: SingViewMode = 'advanced'

const VIEW_KEY = 'kp_sing_view'
const MONITOR_KEY = 'kp_monitor'

const unit = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback

export function parseView(raw: string | null): SingViewMode {
  return raw === 'simple' || raw === 'advanced' ? raw : DEFAULT_VIEW
}

export function parseMonitor(raw: string | null): MonitorPrefs {
  if (!raw) return DEFAULT_MONITOR
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return DEFAULT_MONITOR
  }
  if (!data || typeof data !== 'object') return DEFAULT_MONITOR
  const d = data as Record<string, unknown>
  return {
    on: d.on === true,
    level: unit(d.level, DEFAULT_MONITOR.level),
    effect: MONITOR_EFFECTS.includes(d.effect as MonitorEffect) ? (d.effect as MonitorEffect) : DEFAULT_MONITOR.effect,
    wet: unit(d.wet, DEFAULT_MONITOR.wet),
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // private mode: just for now
  }
}

export const readView = () => parseView(read(VIEW_KEY))
export const writeView = (view: SingViewMode) => write(VIEW_KEY, view)
export const readMonitor = () => parseMonitor(read(MONITOR_KEY))
export const writeMonitor = (prefs: MonitorPrefs) => write(MONITOR_KEY, JSON.stringify(prefs))
