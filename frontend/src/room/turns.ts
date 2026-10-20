import type { LobbyRoom } from './protocol'

/** Who still has to get ready before the first turn in the queue can start. */
export function nextTurnBlockers(room: LobbyRoom): string[] {
  const next = room.queue[0]
  if (!next) return []
  return [next.singer_id, next.partner_id].filter((id): id is string => !!id).filter((id) => {
    const player = room.players.find((p) => p.id === id)
    return !player || !player.connected || !player.ready
  })
}
