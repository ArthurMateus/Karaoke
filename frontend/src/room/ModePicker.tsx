import { Check, Gamepad2, Lock, Sparkles, Ticket, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePlan, useStartPartyPass } from '../api/hooks'
import ErrorText from '../components/ErrorText'
import { Badge, Button, ButtonLink, Card, cx } from '../ui'
import type { ClientMessage, LobbyRoom, Mode } from './protocol'

const MODES: { mode: Mode; icon: typeof Users }[] = [
  { mode: 'sing_together', icon: Users },
  { mode: 'spotlight', icon: Sparkles },
]

/** The host picks the game mode: two big cards. Spotlight shows a lock for free hosts. */
export default function ModePicker({ room, send }: { room: LobbyRoom; send: (message: ClientMessage) => void }) {
  const { t } = useTranslation()
  const open = MODES.filter(({ mode }) => room.allowed_modes.includes(mode))
  const pick = (mode: Mode) => mode !== room.mode && send({ type: 'set_mode', mode })
  // Arrow keys: select the next open mode and move focus with it (a radio group).
  const step = (from: Mode, by: number, group: HTMLElement | null) => {
    const i = open.findIndex((m) => m.mode === from)
    const next = open[(i + by + open.length) % open.length].mode
    pick(next)
    group?.querySelector<HTMLElement>(`[data-mode="${next}"]`)?.focus()
  }

  return (
    <Card eyebrow={t('modes.title')} icon={Gamepad2} wide>
      <div className="mode-cards" role="radiogroup" aria-label={t('modes.title')}>
        {MODES.map(({ mode, icon: Icon }) => {
          const locked = !room.allowed_modes.includes(mode)
          const on = room.mode === mode
          return (
            <button key={mode} data-mode={mode} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} disabled={locked}
              className={cx('mode-card', on && 'on', locked && 'locked')} onClick={() => pick(mode)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') step(mode, 1, e.currentTarget.parentElement)
                else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') step(mode, -1, e.currentTarget.parentElement)
                else return
                e.preventDefault()
              }}>
              <span className="mode-icon" aria-hidden>
                <Icon size={22} />
              </span>
              <span className="mode-text">
                <strong>{t(`modes.${mode}`)}</strong>
                <span className="small">{t(`modes.${mode}Short`)}</span>
                {/* Under the text, not over it: "Premium or Party Pass" is long, more so in Portuguese. */}
                {locked && (
                  <Badge tone="premium" icon={Lock} className="mode-lock">
                    {t('plan.premiumOrPass')}
                  </Badge>
                )}
              </span>
              {on && (
                <span className="mode-check mode-mark" aria-hidden>
                  <Check size={14} strokeWidth={3} />
                </span>
              )}
            </button>
          )
        })}
      </div>
      <p className="muted small">{t(`modes.${room.mode}Help`)}</p>
      {!room.allowed_modes.includes('spotlight') && <PartyPassTicket />}
    </Card>
  )
}

/** A free host's room: Spotlight, 16 players and replays need premium or a Party Pass. Styled as a ticket. */
function PartyPassTicket() {
  const { t } = useTranslation()
  const plan = usePlan(true)
  const startPass = useStartPartyPass()
  const passes = plan.data?.unused_passes ?? 0
  return (
    <div className="ticket">
      <span className="ticket-icon" aria-hidden>
        <Ticket size={22} />
      </span>
      <div className="ticket-body">
        <strong>{t('plan.names.party')}</strong>
        <p className="small">{t('plan.lockedInRoom')}</p>
        {passes > 0 ? (
          <Button variant="primary" size="sm" loading={startPass.isPending} onClick={() => startPass.mutate()}>
            {t('plan.startPassHere', { count: passes })}
          </Button>
        ) : (
          <ButtonLink to="/profile" size="sm">
            {t('plan.getPremium')}
          </ButtonLink>
        )}
        <ErrorText error={startPass.error} />
      </div>
    </div>
  )
}
