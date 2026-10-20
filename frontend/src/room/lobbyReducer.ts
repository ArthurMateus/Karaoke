import { CloseCode, type LobbyRoom, type ServerMessage } from './protocol'

/** Why the room connection stopped for good. Each one has an i18n text in "lobby.ended.*". */
export type EndReason =
  | 'left'
  | 'room_closed'
  | 'not_signed_in'
  | 'room_not_found'
  | 'room_full'
  | 'kicked'
  | 'replaced'
  | 'refused'

export interface LobbyState {
  status: 'connecting' | 'open' | 'reconnecting' | 'ended'
  you: string | null
  room: LobbyRoom | null
  lastError: string | null
  endReason: EndReason | null
}

export type LobbyEvent =
  | { kind: 'open' }
  | { kind: 'message'; message: ServerMessage }
  | { kind: 'closed'; code: number }

export const initialLobbyState: LobbyState = {
  status: 'connecting',
  you: null,
  room: null,
  lastError: null,
  endReason: null,
}

export function lobbyReducer(state: LobbyState, event: LobbyEvent): LobbyState {
  if (state.status === 'ended') return state

  switch (event.kind) {
    case 'open':
      return { ...state, status: 'open' }

    case 'message': {
      const message = event.message
      switch (message.type) {
        case 'welcome':
          return { ...state, status: 'open', you: message.you, lastError: null }
        case 'lobby_state':
          return { ...state, room: message.room }
        case 'scores':
          return state.room ? { ...state, room: { ...state.room, scores: message.scores } } : state
        case 'votes':
          return state.room ? { ...state, room: { ...state.room, votes: message.votes } } : state
        case 'error':
          return { ...state, lastError: message.code }
        case 'kicked':
          return end(state, 'kicked')
        case 'replaced':
          return end(state, 'replaced')
        case 'room_closed':
          return end(state, 'room_closed')
        default:
          return state
      }
    }

    case 'closed': {
      const reason = endReasonFor(event.code, state.lastError)
      return reason ? end(state, reason) : { ...state, status: 'reconnecting' }
    }
  }
}

function end(state: LobbyState, reason: EndReason): LobbyState {
  return { ...state, status: 'ended', endReason: reason }
}

/** null means "unexpected drop, try to reconnect". */
export function endReasonFor(closeCode: number, lastError: string | null): EndReason | null {
  switch (closeCode) {
    case CloseCode.left:
      return 'left'
    case CloseCode.roomClosed:
      return 'room_closed'
    case CloseCode.notSignedIn:
      return 'not_signed_in'
    case CloseCode.roomNotFound:
      return 'room_not_found'
    case CloseCode.replaced:
      return 'replaced'
    case CloseCode.kicked:
      return 'kicked'
    case CloseCode.refused:
      return lastError === 'room_full' || lastError === 'kicked' ? lastError : 'refused'
    default:
      return null
  }
}
