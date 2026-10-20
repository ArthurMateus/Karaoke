import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { REACTIONS, type ClientMessage, type ReactionKind, type ServerMessage } from './protocol'

const EMOJI: Record<ReactionKind, string> = { clap: '👏', fire: '🔥', laugh: '😂', heart: '❤️', wow: '😮' }

const FLOAT_MS = 2600
const MAX_ON_SCREEN = 24

/** The audience's buttons: tap to cheer. */
export function ReactionBar({ send }: { send: (message: ClientMessage) => void }) {
  const { t } = useTranslation()
  return (
    <div className="reaction-bar" role="group" aria-label={t('spotlight.react')}>
      {REACTIONS.map((kind) => (
        <button key={kind} type="button" className="reaction-button" aria-label={t(`spotlight.reactions.${kind}`)}
          onClick={() => send({ type: 'reaction', emoji: kind })}>
          {EMOJI[kind]}
        </button>
      ))}
    </div>
  )
}

interface Floating {
  key: number
  emoji: string
  left: number // % across the screen
  name: string
}

let nextKey = 0

/** Reactions from everyone, floating up over the stage. Place inside a position: relative box. */
export function ReactionLayer({ subscribe, nameOf }: {
  subscribe: (listener: (message: ServerMessage) => void) => () => void
  nameOf: (id: string) => string
}) {
  const [floating, setFloating] = useState<Floating[]>([])

  useEffect(
    () =>
      subscribe((message) => {
        if (message.type !== 'reaction') return
        const item = { key: nextKey++, emoji: EMOJI[message.emoji], left: 8 + Math.random() * 84, name: nameOf(message.from) }
        setFloating((list) => [...list.slice(-(MAX_ON_SCREEN - 1)), item])
        setTimeout(() => setFloating((list) => list.filter((f) => f.key !== item.key)), FLOAT_MS)
      }),
    [subscribe, nameOf],
  )

  return (
    <div className="reaction-layer" aria-hidden>
      {floating.map((f) => (
        <span key={f.key} className="reaction-float" style={{ left: `${f.left}%` }}>
          {f.emoji}
          <small>{f.name}</small>
        </span>
      ))}
    </div>
  )
}
