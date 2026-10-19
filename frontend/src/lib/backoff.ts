/**
 * How long to wait before reconnect attempt number `attempt` (0, 1, 2, ...).
 * Doubles each time up to a cap, with some randomness so a whole room that
 * lost Wi-Fi together doesn't reconnect at the exact same moment.
 */
export function reconnectDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(8000, 500 * 2 ** attempt)
  return Math.round(base * (0.75 + random() * 0.5))
}
