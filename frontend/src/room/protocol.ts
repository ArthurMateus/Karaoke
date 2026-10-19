// Mirrors backend/app/ws/protocol.py and room_state.py snapshot().

export interface LobbyPlayer {
  id: string
  name: string
  is_guest: boolean
  is_host: boolean
  connected: boolean
  ready: boolean
}

export interface LobbyRoom {
  code: string
  host_id: string
  capacity: number
  phase: 'lobby'
  players: LobbyPlayer[]
}

export type ServerMessage =
  | { type: 'welcome'; you: string; server_time: number }
  | { type: 'lobby_state'; room: LobbyRoom }
  | { type: 'pong'; t0: number; server_time: number }
  | { type: 'error'; code: string }
  | { type: 'kicked' }
  | { type: 'replaced' }
  | { type: 'room_closed' }

export type ClientMessage =
  | { type: 'ping'; t0: number }
  | { type: 'set_ready'; ready: boolean }
  | { type: 'kick'; player_id: string }
  | { type: 'leave' }
  | { type: 'close_room' }

export const CloseCode = {
  left: 4000,
  roomClosed: 4400,
  notSignedIn: 4401,
  refused: 4403,
  roomNotFound: 4404,
  replaced: 4409,
  kicked: 4410,
} as const
