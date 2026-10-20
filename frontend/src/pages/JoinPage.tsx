import { DoorOpen, Home, LogIn, PartyPopper, UserRound, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router'
import { useMe, usePlayAsGuest, useRoomInfo } from '../api/hooks'
import type { RoomInfo } from '../api/types'
import AuthCard from '../components/AuthCard'
import ErrorText from '../components/ErrorText'
import { currentLocale } from '../i18n'
import { playerColor } from '../lib/colors'
import { normalizeCode } from '../lib/roomCode'
import { Avatar, Badge, Button, ButtonLink, Skeleton } from '../ui'
import { LEGAL_LINKS } from '../components/legalLinks'

/** Where QR codes and invite links point. Signed-in players go straight to the room. */
export default function JoinPage() {
  const { code: rawCode = '' } = useParams()
  const code = normalizeCode(rawCode)
  if (!code) return <NoRoom error="room_not_found" />
  return <Join code={code} />
}

function NoRoom({ error }: { error: unknown }) {
  const { t } = useTranslation()
  return (
    <AuthCard icon={DoorOpen} tone="danger" title={t('join.notFoundTitle')}>
      <ErrorText error={error} />
      <ButtonLink size="lg" block icon={Home} to="/">
        {t('join.backHome')}
      </ButtonLink>
    </AuthCard>
  )
}

function Join({ code }: { code: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const me = useMe()
  const room = useRoomInfo(code)
  const playAsGuest = usePlayAsGuest()
  const [name, setName] = useState('')

  if (me.data?.user) return <Navigate to={`/room/${code}`} replace />
  if (room.isError) return <NoRoom error={room.error} />
  if (me.isPending || room.isPending) {
    // The card's own shape, so nothing jumps when the room arrives.
    return (
      <AuthCard icon={PartyPopper} title={<Skeleton width="70%" height={30} />} busy>
        <Skeleton height={64} radius="var(--r-control)" />
        <Skeleton height={48} radius="var(--r-control)" />
        <Skeleton height={52} radius="var(--r-control)" />
      </AuthCard>
    )
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    playAsGuest.mutate(
      { display_name: name, locale: currentLocale() },
      { onSuccess: () => navigate(`/room/${code}`) },
    )
  }

  return (
    <AuthCard icon={PartyPopper} title={t('join.title', { host: room.data.host_name })}>
      <RoomStrip room={room.data} />
      <form className="auth-form" onSubmit={submit}>
        <label htmlFor="name">{t('join.yourName')}</label>
        <div className="input-with-icon">
          <UserRound size={18} aria-hidden />
          <input
            id="name"
            className="input"
            required
            maxLength={24}
            autoComplete="nickname"
            placeholder={t('join.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <Button variant="primary" size="lg" block type="submit" icon={PartyPopper} loading={playAsGuest.isPending}>
          {playAsGuest.isPending ? t('join.joining') : t('join.asGuest')}
        </Button>
        <p className="muted small auth-legal">
          <Trans i18nKey="join.notice" components={LEGAL_LINKS} />
        </p>
      </form>
      <ErrorText error={playAsGuest.error} />
      <div className="auth-divider">
        <span>{t('join.haveAccount')}</span>
      </div>
      <ButtonLink variant="ghost" block icon={LogIn} to={`/sign-in?next=/join/${code}`}>
        {t('join.signInInstead')}
      </ButtonLink>
    </AuthCard>
  )
}

/** Whose room, its code and how full it is. */
function RoomStrip({ room }: { room: RoomInfo }) {
  const { t } = useTranslation()
  const full = room.player_count >= room.capacity
  return (
    <div className="join-room">
      <Avatar name={room.host_name} color={playerColor(0)} size="lg" host decorative />
      <div className="join-room-text">
        <span className="join-room-code" aria-label={t('join.codeLabel', { code: room.code })}>
          {room.code}
        </span>
        <span className="muted small join-room-count">
          <Users size={15} aria-hidden />
          {t('join.players', { count: room.player_count, capacity: room.capacity })}
        </span>
      </div>
      {full && <Badge tone="warn">{t('join.full')}</Badge>}
    </div>
  )
}
