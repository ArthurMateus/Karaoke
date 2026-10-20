import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router'
import { useMe, useUpdateMe } from '../api/hooks'
import type { User } from '../api/types'
import ErrorText from '../components/ErrorText'
import PlanCard from '../components/PlanCard'

export default function ProfilePage() {
  const me = useMe()
  if (me.isPending) return null
  if (!me.data?.user) return <Navigate to="/sign-in?next=/profile" replace />
  return <Profile user={me.data.user} />
}

function Profile({ user }: { user: User }) {
  const { t } = useTranslation()
  const update = useUpdateMe()
  const [name, setName] = useState(user.display_name)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    update.mutate({ display_name: name })
  }

  return (
    <div className="stack">
    <section className="card stack">
      <h1>{t('profile.title')}</h1>
      <form className="stack" onSubmit={submit}>
        <label htmlFor="display-name">{t('profile.name')}</label>
        <input
          id="display-name"
          className="input"
          required
          maxLength={24}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="button primary" type="submit" disabled={update.isPending}>
          {update.isSuccess ? t('profile.saved') : t('profile.save')}
        </button>
      </form>
      <ErrorText error={update.error} />
      {user.email ? (
        <p className="muted">
          {t('profile.email')}: {user.email}
        </p>
      ) : (
        <p className="muted small">
          {t('profile.guestNote')} <Link to="/sign-in">{t('nav.signIn')}</Link>
        </p>
      )}
    </section>
    {!user.is_guest && <PlanCard />}
    </div>
  )
}
