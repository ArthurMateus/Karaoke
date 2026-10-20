// Small helpers for chosen files (upload and import pages).

/** Does `file` fit an <input accept> list such as ".mp3,.m4a,audio/*"? */
export function fitsAccept(file: File, accept: string): boolean {
  const name = file.name.toLowerCase()
  return accept
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean)
    .some((a) => (a.startsWith('.') ? name.endsWith(a) : a.endsWith('/*') ? file.type.startsWith(a.slice(0, -1)) : file.type === a))
}

/** "4.2 MB", or "12 KB" under a megabyte. */
export function formatSize(bytes: number, language: string): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString(language)} KB`
  const mb = bytes / (1024 * 1024)
  return `${mb.toLocaleString(language, { maximumFractionDigits: mb < 10 ? 1 : 0 })} MB`
}
