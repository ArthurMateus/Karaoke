// Must match backend/app/services/rooms.py: no 0/O or 1/I/L, because codes
// are read aloud and typed on phones.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 6

/** "abc 234" / "ABC-234" -> "ABC234"; null if it can't be a room code. */
export function normalizeCode(raw: string): string | null {
  const code = raw.replace(/[\s-]/g, '').toUpperCase()
  if (code.length !== CODE_LENGTH) return null
  return [...code].every((ch) => CODE_ALPHABET.includes(ch)) ? code : null
}

/** "ABC234" -> "ABC 234", easier to read out loud. */
export function formatCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`
}
