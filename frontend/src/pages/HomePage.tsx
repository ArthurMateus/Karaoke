import { useState, type FormEvent } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { useCreateRoom, useMe } from '../api/hooks'
import { LaneArt } from '../components/Brand'
import ErrorText from '../components/ErrorText'
import { normalizeCode } from '../lib/roomCode'

export default function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data } = useMe()
  const createRoom = useCreateRoom()
  const [code, setCode] = useState('')
  const [codeInvalid, setCodeInvalid] = useState(false)
  const user = data?.user

  const join = (e: FormEvent) => {
    e.preventDefault()
    const normalized = normalizeCode(code)
    setCodeInvalid(!normalized)
    if (normalized) navigate(`/join/${normalized}`)
  }

  return (
    <div className="home">
      <section className="hero">
        <LaneArt />
        <h1>
          <Trans i18nKey="home.headline" components={{ em: <em /> }} />
        </h1>
        <p>{t('app.tagline')}</p>
      </section>

      <div className="home-actions">
        <section className="card">
          <h2>{t('home.hostTitle')}</h2>
          <p className="muted">{t('home.hostText')}</p>
          {user && !user.is_guest ? (
            <button
              className="button primary big"
              disabled={createRoom.isPending}
              onClick={() => createRoom.mutate(undefined, { onSuccess: (room) => navigate(`/room/${room.code}`) })}
            >
              {createRoom.isPending ? t('home.creating') : t('home.createRoom')}
            </button>
          ) : (
            <Link className="button primary big" to="/sign-in">
              {t('nav.signIn')}
            </Link>
          )}
          {!(user && !user.is_guest) && <p className="muted small">{t('home.signInToHost')}</p>}
          <ErrorText error={createRoom.error} />
        </section>

        <section className="card">
          <h2>{t('home.joinTitle')}</h2>
          <form className="row" onSubmit={join}>
            <label className="sr-only" htmlFor="room-code">
              {t('home.codeLabel')}
            </label>
            <input
              id="room-code"
              className="input code-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('home.codePlaceholder')}
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={8}
            />
            <button className="button" type="submit">
              {t('home.join')}
            </button>
          </form>
          {codeInvalid && <p className="error">{t('home.invalidCode')}</p>}
        </section>
      </div>
    </div>
  )
}
