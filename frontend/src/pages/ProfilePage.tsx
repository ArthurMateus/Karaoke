import { Check, LogIn, Mail, Save, UserRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router'
import { useMe, useUpdateMe } from '../api/hooks'
import type { User } from '../api/types'
import ErrorText from '../components/ErrorText'
import PlanCard from '../components/PlanCard'
import { playerColor } from '../lib/colors'
import { Avatar, Badge, Button, ButtonLink, PageHeader, Skeleton } from '../ui'

export default function ProfilePage() {
  const me = useMe()
  if (me.isPending) return <ProfileSkeleton />
  if (!me.data?.user) return <Navigate to="/sign-in?next=/profile" replace />
  return <Profile user={me.data.user} />
}

function ProfileSkeleton() {
  return (
    <div className="profile" aria-busy="true">
      <Skeleton width={180} height={40} />
      <div className="profile-grid">
        <Skeleton height={300} radius="var(--r-card)" />
        <Skeleton height={420} radius="var(--r-card)" />
      </div>
    </div>
  )
}

function Profile({ user }: { user: User }) {
  const { t } = useTranslation()
  const update = useUpdateMe()
  const [name, setName] = useState(user.display_name)
  const changed = name.trim() !== user.display_name

  const submit = (e: FormEvent) => {
    e.preventDefault()
    update.mutate({ display_name: name })
  }

  return (
    <div className={user.is_guest ? 'profile guest' : 'profile'}>
      <PageHeader icon={UserRound} title={t('profile.title')} />
      <div className={user.is_guest ? 'profile-grid single' : 'profile-grid'}>
        <section className="card stack profile-card" aria-labelledby="profile-who">
          <div className="profile-who">
            <Avatar name={name || user.display_name} color={playerColor(0)} size="xl" me decorative />
            <div className="profile-who-text">
              <h2 id="profile-who">{user.display_name}</h2>
              {user.email ? (
                <span className="muted small profile-email">
                  <Mail size={15} aria-hidden />
                  <span className="sr-only">{t('profile.email')}: </span>
                  {user.email}
                </span>
              ) : (
                <Badge>{t('profile.guest')}</Badge>
              )}
            </div>
          </div>

          <form className="stack tight" onSubmit={submit}>
            <label htmlFor="display-name">{t('profile.name')}</label>
            <input
              id="display-name"
              className="input"
              required
              maxLength={24}
              autoComplete="nickname"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                update.reset() // "Saved!" no longer fits once the name changes again
              }}
            />
            <p className="muted small">{t('profile.nameHelp')}</p>
            <div className="profile-save">
              <Button variant="primary" type="submit" icon={Save} loading={update.isPending} disabled={!changed}>
                {t('profile.save')}
              </Button>
              {update.isSuccess && !changed && (
                <span className="ok-text small profile-saved" role="status">
                  <Check size={16} aria-hidden />
                  {t('profile.saved')}
                </span>
              )}
            </div>
          </form>
          <ErrorText error={update.error} />

          {user.is_guest && (
            <div className="profile-guest">
              <p className="small">{t('profile.guestNote')}</p>
              <ButtonLink variant="secondary" icon={LogIn} to="/sign-in?next=/profile">
                {t('nav.signIn')}
              </ButtonLink>
            </div>
          )}
        </section>
        {!user.is_guest && <PlanCard />}
      </div>
    </div>
  )
}
