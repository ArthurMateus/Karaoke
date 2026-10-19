import { useCallback, useEffect, useReducer, useRef } from 'react'
import { reconnectDelayMs } from '../lib/backoff'
import { endReasonFor, initialLobbyState, lobbyReducer } from './lobbyReducer'
import type { ClientMessage, ServerMessage } from './protocol'

const KEEPALIVE_MS = 25_000
const FINAL_MESSAGES = new Set(['kicked', 'replaced', 'room_closed'])

/** Connects to a room and keeps reconnecting until the room tells us to stop. */
export function useRoomSocket(code: string) {
  const [state, dispatch] = useReducer(lobbyReducer, initialLobbyState)
  const socketRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    let attempt = 0
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let keepalive: ReturnType<typeof setInterval> | undefined
    let disposed = false
    let finished = false
    let lastError: string | null = null

    const connect = () => {
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${scheme}://${location.host}/ws/rooms/${code}`)
      socketRef.current = ws

      ws.onopen = () => {
        attempt = 0
        dispatch({ kind: 'open' })
        // Regular pings keep proxies from closing an idle connection (and feed clock sync later).
        keepalive = setInterval(() => send(ws, { type: 'ping', t0: performance.now() }), KEEPALIVE_MS)
      }
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data) as ServerMessage
        if (message.type === 'error') lastError = message.code
        if (message.type === 'welcome') lastError = null
        if (FINAL_MESSAGES.has(message.type)) finished = true
        dispatch({ kind: 'message', message })
      }
      ws.onclose = (event) => {
        clearInterval(keepalive)
        if (disposed) return
        dispatch({ kind: 'closed', code: event.code })
        if (!finished && endReasonFor(event.code, lastError) === null) {
          retryTimer = setTimeout(connect, reconnectDelayMs(attempt++))
        }
      }
    }

    connect()
    return () => {
      disposed = true
      clearTimeout(retryTimer)
      clearInterval(keepalive)
      socketRef.current?.close()
    }
  }, [code])

  const sendMessage = useCallback((message: ClientMessage) => {
    if (socketRef.current) send(socketRef.current, message)
  }, [])

  return { state, send: sendMessage }
}

function send(ws: WebSocket, message: ClientMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message))
}
