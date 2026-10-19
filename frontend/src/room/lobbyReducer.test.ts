import { describe, expect, it } from 'vitest'
import { initialLobbyState, lobbyReducer, type LobbyEvent, type LobbyState } from './lobbyReducer'
import { CloseCode, type LobbyRoom } from './protocol'

const room: LobbyRoom = {
  code: 'ABC234',
  host_id: 'h',
  capacity: 4,
  phase: 'lobby',
  players: [{ id: 'h', name: 'Host', is_guest: false, is_host: true, connected: true, ready: false }],
}

function run(...events: LobbyEvent[]): LobbyState {
  return events.reduce(lobbyReducer, initialLobbyState)
}

describe('lobbyReducer', () => {
  it('opens and stores who I am and the room', () => {
    const state = run(
      { kind: 'open' },
      { kind: 'message', message: { type: 'welcome', you: 'h', server_time: 1 } },
      { kind: 'message', message: { type: 'lobby_state', room } },
    )
    expect(state).toMatchObject({ status: 'open', you: 'h', room })
  })

  it('reconnects after an unexpected drop and keeps the last room', () => {
    const state = run(
      { kind: 'message', message: { type: 'lobby_state', room } },
      { kind: 'closed', code: 1006 },
    )
    expect(state.status).toBe('reconnecting')
    expect(state.room).toBe(room)
  })

  it('ends when kicked', () => {
    const state = run({ kind: 'message', message: { type: 'kicked' } }, { kind: 'closed', code: CloseCode.kicked })
    expect(state).toMatchObject({ status: 'ended', endReason: 'kicked' })
  })

  it('uses the error sent before a refusal as the reason', () => {
    const state = run(
      { kind: 'message', message: { type: 'error', code: 'room_full' } },
      { kind: 'closed', code: CloseCode.refused },
    )
    expect(state.endReason).toBe('room_full')
  })

  it.each([
    [CloseCode.roomNotFound, 'room_not_found'],
    [CloseCode.notSignedIn, 'not_signed_in'],
    [CloseCode.roomClosed, 'room_closed'],
    [CloseCode.replaced, 'replaced'],
    [CloseCode.left, 'left'],
  ])('close code %i ends with %s', (code, reason) => {
    expect(run({ kind: 'closed', code }).endReason).toBe(reason)
  })

  it('stays ended no matter what arrives afterwards', () => {
    const state = run({ kind: 'message', message: { type: 'room_closed' } }, { kind: 'open' }, { kind: 'closed', code: 1006 })
    expect(state).toMatchObject({ status: 'ended', endReason: 'room_closed' })
  })

  it('a welcome clears a previous error', () => {
    const state = run(
      { kind: 'message', message: { type: 'error', code: 'bad_message' } },
      { kind: 'message', message: { type: 'welcome', you: 'h', server_time: 1 } },
    )
    expect(state.lastError).toBeNull()
  })
})
