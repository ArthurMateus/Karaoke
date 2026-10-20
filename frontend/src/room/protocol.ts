// Mirrors backend/app/ws/protocol.py and room_state.py snapshot().

export interface LobbyPlayer {
  id: string
  name: string
  is_guest: boolean
  is_host: boolean
  connected: boolean
  ready: boolean
}

export interface RoomSong {
  id: string
  title: string
  artist: string
  duration_seconds: number
  is_duet: boolean
}

export type Phase = 'lobby' | 'countdown' | 'playing' | 'results'
export type Mode = 'sing_together' | 'spotlight'
export const REACTIONS = ['clap', 'fire', 'laugh', 'heart', 'wow'] as const
export type ReactionKind = (typeof REACTIONS)[number]

/** Spotlight: a turn waiting in the queue. A duet has a partner singing part 2. */
export interface QueueEntry {
  id: string
  singer_id: string
  partner_id: string | null
  song: RoomSong
}

/** Spotlight: the audience's stars for the turn just sung. */
export interface VoteSummary {
  count: number
  average: number | null
  voters: string[]
  points: Record<string, number> // singer id -> turn points (pitch blended with stars)
}

export interface Standing {
  id: string
  points: number // average over their turns
  turns: number
}

export interface LobbyRoom {
  code: string
  host_id: string
  capacity: number
  phase: Phase
  players: LobbyPlayer[]
  song: RoomSong | null
  performance_id: string | null
  start_at: number | null // server time (ms) the song starts
  parts: Record<string, 'P1' | 'P2'> // who sings, and which part
  scores: Record<string, number>
  mode: Mode
  queue: QueueEntry[]
  votes: VoteSummary | null // Spotlight, for the current turn
  standings: Standing[] // Spotlight, tonight
  stage_connected: boolean // a stage screen is playing the music for the room
}

export type ServerMessage =
  | { type: 'welcome'; you: string; server_time: number }
  | { type: 'lobby_state'; room: LobbyRoom }
  | { type: 'pong'; t0: number; server_time: number }
  | { type: 'scores'; scores: Record<string, number> }
  | { type: 'reaction'; from: string; emoji: ReactionKind }
  | { type: 'votes'; votes: VoteSummary }
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
  | { type: 'select_song'; song_id: string }
  | { type: 'start' }
  | { type: 'score'; total: number }
  | { type: 'finished'; total: number }
  | { type: 'back_to_lobby' }
  | { type: 'set_mode'; mode: Mode }
  | { type: 'queue_add'; song_id: string; partner_id: string | null }
  | { type: 'queue_remove'; entry_id: string }
  | { type: 'queue_move'; entry_id: string; delta: number }
  | { type: 'reaction'; emoji: ReactionKind }
  | { type: 'vote'; stars: number }

export const CloseCode = {
  left: 4000,
  roomClosed: 4400,
  notSignedIn: 4401,
  refused: 4403,
  roomNotFound: 4404,
  replaced: 4409,
  kicked: 4410,
} as const
