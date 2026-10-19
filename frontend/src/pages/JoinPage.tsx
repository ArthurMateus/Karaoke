import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { useMe, usePlayAsGuest, useRoomInfo } from '../api/hooks'
import ErrorText from '../components/ErrorText'
import { currentLocale } from '../i18n'
import { normalizeCode } from '../lib/roomCode'

/** Where QR codes and invite links point. Signed-in players go straight to the room. */
export default function JoinPage() {
  const { code: rawCode = '' } = useParams()
  const code = normalizeCode(rawCode)
  if (!code) return <ErrorText error="room_not_found" />
  return <Join code={code} />
}

function Join({ code }: { code: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const me = useMe()
  const room = useRoomInfo(code)
  const playAsGuest = usePlayAsGuest()
  const [name, setName] = useState('')

  if (me.data?.user) return <Navigate to={`/room/${code}`} replace />
  if (room.isError) return <ErrorText error={room.error} />
  if (me.isPending || room.isPending) return null

  const submit = (e: FormEvent) => {
    e.preventDefault()
    playAsGuest.mutate(
      { display_name: name, locale: currentLocale() },
      { onSuccess: () => navigate(`/room/${code}`) },
    )
  }

  return (
    <section className="card stack">
      <h1>{t('join.title', { host: room.data.host_name })}</h1>
      <p className="muted">{t('join.players', { count: room.data.player_count, capacity: room.data.capacity })}</p>
      <form className="stack" onSubmit={submit}>
        <label htmlFor="name">{t('join.yourName')}</label>
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
        <button className="button primary" type="submit" disabled={playAsGuest.isPending}>
          {playAsGuest.isPending ? t('join.joining') : t('join.asGuest')}
        </button>
      </form>
      <ErrorText error={playAsGuest.error} />
      <p className="muted small">
        {t('join.haveAccount')} <Link to={`/sign-in?next=/join/${code}`}>{t('nav.signIn')}</Link>
      </p>
    </section>
  )
}
