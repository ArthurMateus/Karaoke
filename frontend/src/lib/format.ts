/** 125.4 seconds -> "2:05". */
export function formatDuration(seconds: number | null): string {
  if (seconds == null) return ''
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
