import { useEffect, useState } from 'react'
import type { ClientMessage, ServerMessage } from '../room/protocol'
import { ClockSync, sampleFromPong, wallNow } from './clock'

const BURST = 8 // quick pings right after connecting
const BURST_GAP_MS = 150
const STEADY_MS = 10_000 // then one every 10 s to follow clock drift

/** Keeps a ClockSync up to date over the room socket. */
export function useClockSync(
  connected: boolean,
  send: (message: ClientMessage) => void,
  subscribe: (listener: (message: ServerMessage) => void) => () => void,
) {
  const [clock] = useState(() => new ClockSync())
  const [ready, setReady] = useState(false)

  useEffect(
    () =>
      subscribe((message) => {
        if (message.type !== 'pong') return
        clock.add(sampleFromPong(message.t0, message.server_time, wallNow()))
        if (clock.ready) setReady(true)
      }),
    [subscribe, clock],
  )

  useEffect(() => {
    if (!connected) return
    const timers: ReturnType<typeof setTimeout>[] = []
    for (let i = 0; i < BURST; i++) timers.push(setTimeout(() => send({ type: 'ping', t0: wallNow() }), i * BURST_GAP_MS))
    const steady = setInterval(() => send({ type: 'ping', t0: wallNow() }), STEADY_MS)
    return () => {
      timers.forEach(clearTimeout)
      clearInterval(steady)
    }
  }, [connected, send])

  return { clock, ready }
}
