/** 10000 -> "10,000" in English, "10.000" in Portuguese (the app's language, not the browser's). */
export function formatScore(score: number, language: string): string {
  return score.toLocaleString(language)
}

/** 125.4 seconds -> "2:05". */
export function formatDuration(seconds: number | null): string {
  if (seconds == null) return ''
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
