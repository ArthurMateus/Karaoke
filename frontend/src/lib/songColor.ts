// Generated cover art: every song gets its own colour and note pattern, the same on every device.

/** A 32-bit FNV-1a hash of a string. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** The song's hue (0-359), from its id. */
export function songHue(id: string): number {
  return hashString(id) % 360
}

/** A small seeded random generator (mulberry32): the same seed gives the same numbers. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Up to two letters for a cover: the first letters of the first two words ("Row, Row, Row" -> "RR"). */
export function coverLetters(title: string): string {
  const words = title.match(/[\p{L}\p{N}]+/gu) ?? []
  return words
    .slice(0, 2)
    .map((w) => [...w][0])
    .join('')
    .toUpperCase()
}

/** Notes for the cover's mini lane: [x, y, width] in a 64 x 64 box. */
export function coverNotes(id: string): [number, number, number][] {
  const random = seededRandom(hashString(id) ^ 0x9e3779b9)
  const notes: [number, number, number][] = []
  let x = 4
  let y = 30 + random() * 16
  while (x < 58) {
    const width = 8 + Math.round(random() * 10)
    notes.push([x, Math.round(y), Math.min(width, 62 - x)])
    x += width + 3 + Math.round(random() * 4)
    y = Math.max(22, Math.min(50, y + (random() - 0.5) * 18))
  }
  return notes
}
