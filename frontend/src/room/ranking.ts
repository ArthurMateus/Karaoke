import type { Standing } from './protocol'

/** Sorted by score, with shared places for equal scores (10, 10, 8 -> 1, 1, 3). */
export function placeAll<T extends { score: number }>(rows: T[]): (T & { place: number })[] {
  const sorted = [...rows].sort((a, b) => b.score - a.score)
  return sorted.map((row) => ({ ...row, place: 1 + sorted.filter((other) => other.score > row.score).length }))
}

/** Where everyone stood before this turn: this turn's points taken back out of the singers' averages.
 * The server rounds averages, so this can be a point off; it only decides the arrows. */
export function placesBefore(standings: Standing[], singers: string[], turnPoints: Record<string, number>): Map<string, number> {
  const before: Standing[] = []
  for (const row of standings) {
    const turn = turnPoints[row.id]
    if (!singers.includes(row.id) || turn === undefined) before.push(row)
    else if (row.turns > 1) before.push({ id: row.id, turns: row.turns - 1, points: (row.points * row.turns - turn) / (row.turns - 1) })
    // A first turn: not on the board before.
  }
  before.sort((a, b) => b.points - a.points || b.turns - a.turns)
  return new Map(before.map((row, i) => [row.id, i + 1]))
}

/** The standings with this turn's latest points. Live votes arrive without new standings, so the
 * singers' averages are redone: `basis` is what this turn counted for when `standings` was sent. */
export function liveStandings(standings: Standing[], basis: Record<string, number>, live: Record<string, number>): Standing[] {
  return standings
    .map((row) => {
      const was = basis[row.id]
      const now = live[row.id]
      if (was === undefined || now === undefined || was === now) return row
      return { ...row, points: Math.round((row.points * row.turns - was + now) / row.turns) }
    })
    .sort((a, b) => b.points - a.points || b.turns - a.turns)
}
