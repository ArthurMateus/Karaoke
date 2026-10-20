import confetti from 'canvas-confetti'
import { useEffect } from 'react'

const COLORS = ['#5b3df5', '#df4699', '#e0951a', '#1f9e86', '#ff6b4a', '#ffffff']

/** A short burst of confetti from both sides. Nothing with reduced motion. */
export function celebrate(): void {
  if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const shared = { particleCount: 70, spread: 65, startVelocity: 48, ticks: 220, colors: COLORS, disableForReducedMotion: true, zIndex: 50 }
  void confetti({ ...shared, angle: 60, origin: { x: 0, y: 0.75 } })
  void confetti({ ...shared, angle: 120, origin: { x: 1, y: 0.75 } })
}

// Confetti once per performance, even when the results are shown again (StrictMode, reconnects).
const celebrated = new Set<string>()

/** Confetti for a performance's winner, once. */
export function useCelebrate(key: string | null, when: boolean) {
  useEffect(() => {
    if (!key || !when || celebrated.has(key)) return
    // A beat after the podium appears. Marked when it fires: StrictMode runs this effect twice.
    const timer = setTimeout(() => {
      celebrated.add(key)
      celebrate()
    }, 450)
    return () => clearTimeout(timer)
  }, [key, when])
}
