import { useEffect, useRef, useState } from 'react'

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Counts from the last shown number up to `value` (or jumps there with reduced motion). */
export function useCountUp(value: number, durationMs = 900): number {
  const reduced = reducedMotion()
  const [shown, setShown] = useState(reduced ? value : 0)
  const from = useRef(shown)
  useEffect(() => {
    if (reducedMotion()) return
    const start = performance.now()
    const begin = from.current
    let frame = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs)
      const eased = 1 - (1 - p) ** 3
      const n = Math.round(begin + (value - begin) * eased)
      setShown(n)
      from.current = n
      if (p < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, durationMs])
  return reduced ? value : shown
}

/** Copy to the clipboard, with "copied" for 2 seconds. False when the browser blocks it. */
export function useCopy(): [boolean, (text: string) => Promise<boolean>] {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      return false
    }
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2000)
    return true
  }
  return [copied, copy]
}

/** The current time, updated every `everyMs`. */
export function useNow(everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}

/** 3725000 ms -> "1:02:05", 65000 -> "1:05". */
export function formatTimeLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}
