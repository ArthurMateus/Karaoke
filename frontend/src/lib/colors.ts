// Player colors, in join order. They are CSS variables so the stylesheet owns the palette.
const PLAYER_COLORS = ['--violet', '--coral', '--teal', '--amber', '--blue', '--pink', '--ink-2', '--lime']

export function playerColor(index: number): string {
  return `var(${PLAYER_COLORS[index % PLAYER_COLORS.length]})`
}
