import { Share2, Sparkles, Ticket, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePlan } from '../api/hooks'
import QrCode from '../components/QrCode'
import { formatCode } from '../lib/roomCode'
import { Badge, Button, Card, CopyField, useCopy, useNow, useToast } from '../ui'
import type { LobbyRoom } from './protocol'

/** The room's code, QR and link, big, plus what the room's plan allows. */
export default function InvitePanel({ code, joinUrl, room, isHost }: { code: string; joinUrl: string; room: LobbyRoom | null; isHost: boolean }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [, copy] = useCopy()

  // Phones get the system share sheet (WhatsApp, Messages...); computers copy the link.
  const share = async () => {
    const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
    if (coarse && navigator.share) {
      try {
        await navigator.share({ title: t('app.name'), text: t('lobby.shareText', { code: formatCode(code) }), url: joinUrl })
        return
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return // closed the sheet
      }
    }
    if (await copy(joinUrl)) toast.success(t('lobby.linkCopied'))
    else toast.error(t('lobby.copyFailed'))
  }

  return (
    <Card className="invite" wide>
      <div className="invite-top">
        <span className="eyebrow">{t('lobby.code')}</span>
        {room && <PlanBadge room={room} isHost={isHost} />}
      </div>
      <p className="room-code" aria-label={`${t('lobby.code')}: ${code.split('').join(' ')}`}>
        {formatCode(code)}
      </p>
      <div className="qr-tile">
        <QrCode text={joinUrl} label={t('lobby.scanToJoin')} />
      </div>
      <p className="muted small invite-scan">{t('lobby.scanToJoin')}</p>
      <Button variant="primary" icon={Share2} block onClick={share}>
        {t('lobby.share')}
      </Button>
      <CopyField value={joinUrl} label={t('lobby.copyLink')} />
    </Card>
  )
}

/** "Free · 4 players", "Premium room · 16 players", or "Night Pass until 23:10" (everyone sees it). */
function PlanBadge({ room, isHost }: { room: LobbyRoom; isHost: boolean }) {
  const { t, i18n } = useTranslation()
  const now = useNow(60_000)
  // The room says when a Night Pass ends; a server without that field only tells the host (their own plan).
  const plan = usePlan(isHost && room.plan === undefined)
  const partyUntil = room.plan !== undefined ? (room.plan === 'party' ? room.plan_until : null) : isHost ? plan.data?.party_until : null
  if (partyUntil) {
    const end = new Date(partyUntil)
    // "until Wed 10:19" when it ends on another day, so nobody reads tomorrow morning as today.
    const sameDay = end.toDateString() === new Date(now).toDateString()
    const time = end.toLocaleString(i18n.language, { weekday: sameDay ? undefined : 'short', hour: '2-digit', minute: '2-digit' })
    return (
      <Badge tone="pass" icon={Ticket}>
        {t('lobby.planParty', { time })}
      </Badge>
    )
  }
  if (room.allowed_modes.includes('spotlight')) {
    return (
      <Badge tone="premium" icon={Sparkles}>
        {t('lobby.planPremium', { count: room.capacity })}
      </Badge>
    )
  }
  return (
    <Badge tone="neutral" icon={Users}>
      {t('lobby.planFree', { count: room.capacity })}
    </Badge>
  )
}
