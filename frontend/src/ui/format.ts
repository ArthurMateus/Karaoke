/** The first letter of a name (emoji-safe), for avatars. */
export function initialOf(name: string): string {
  return ([...name.trim()][0] ?? '?').toUpperCase()
}
