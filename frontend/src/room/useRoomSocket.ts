import { useCallback, useEffect, useReducer, useRef } from 'react'
import { wallNow } from '../game/clock'
import { reconnectDelayMs } from '../lib/backoff'
import { endReasonFor, initialLobbyState, lobbyReducer } from './lobbyReducer'
import type { ClientMessage, ServerMessage } from './protocol'

const KEEPALIVE_MS = 25_000
const FINAL_MESSAGES = new Set(['kicked', 'replaced', 'room_closed'])

type Listener = (message: ServerMessage) => void

/**
 * Connects to a room and keeps reconnecting until the room tells us to stop.
 * `path` is the socket address: a player's by default, or a stage screen's (/ws/stage/CODE?t=...).
 */
export function useRoomSocket(code: string, path = `/ws/rooms/${code}`) {
  const [state, dispatch] = useReducer(lobbyReducer, initialLobbyState)
  const socketRef = useRef<WebSocket | null>(null)
  const listeners = useRef(new Set<Listener>())

  useEffect(() => {
    let attempt = 0
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let keepalive: ReturnType<typeof setInterval> | undefined
    let disposed = false
    let finished = false
    let lastError: string | null = null

    const connect = () => {
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${scheme}://${location.host}${path}`)
      socketRef.current = ws

      ws.onopen = () => {
        attempt = 0
        dispatch({ kind: 'open' })
        // Regular pings keep proxies from closing an idle connection (and feed clock sync later).
        keepalive = setInterval(() => send(ws, { type: 'ping', t0: wallNow() }), KEEPALIVE_MS)
      }
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data) as ServerMessage
        if (message.type === 'error') lastError = message.code
        if (message.type === 'welcome') lastError = null
        if (FINAL_MESSAGES.has(message.type)) finished = true
        dispatch({ kind: 'message', message })
        listeners.current.forEach((listener) => listener(message))
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
  }, [path])

  const sendMessage = useCallback((message: ClientMessage) => {
    if (socketRef.current) send(socketRef.current, message)
  }, [])

  /** Listen to raw messages (e.g. pongs for clock sync). Returns an unsubscribe function. */
  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener)
    return () => {
      listeners.current.delete(listener)
    }
  }, [])

  return { state, send: sendMessage, subscribe }
}

function send(ws: WebSocket, message: ClientMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message))
}
