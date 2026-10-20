import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useDeleteSong, useMe, useRetrySong, useSongs } from '../api/hooks'
import type { Song } from '../api/types'
import ErrorText from '../components/ErrorText'
import { useConfirm } from '../ui'
import { formatDuration } from '../lib/format'

export default function SongsPage() {
  const { t } = useTranslation()
  const me = useMe()
  const songs = useSongs()
  const user = me.data?.user
  const hasAccount = !!user && !user.is_guest

  if (songs.isError) return <ErrorText error={songs.error} />
  if (!songs.data) return null
  const { starter, mine, conversions_left, conversions_per_month } = songs.data

  return (
    <div className="stack wide">
      <h1>{t('songs.title')}</h1>

      <section className="card wide stack">
        <div className="row spread wrap">
          <h2>{t('songs.mine')}</h2>
          {hasAccount && (
            <div className="row wrap">
              <Link className={`button primary ${conversions_left === 0 ? 'disabled' : ''}`} to="/songs/upload">
                {t('songs.upload')}
              </Link>
              <Link className="button" to="/songs/import">
                {t('songs.import')}
              </Link>
            </div>
          )}
        </div>
        {hasAccount ? (
          <>
            {conversions_per_month != null && (
              <p className="muted small">{t('songs.quota', { left: conversions_left, total: conversions_per_month })}</p>
            )}
            <p className="muted small">{t('songs.private')}</p>
            {mine.length === 0 ? <p className="muted">{t('songs.empty')}</p> : <SongList songs={mine} />}
          </>
        ) : (
          <p>
            <Link to="/sign-in?next=/songs">{t('nav.signIn')}</Link> · {t('songs.signInToUpload')}
          </p>
        )}
      </section>

      <section className="card wide stack">
        <h2>{t('songs.starter')}</h2>
        <p className="muted small">{t('songs.starterNote')}</p>
        <SongList songs={starter} />
      </section>
    </div>
  )
}

function SongList({ songs }: { songs: Song[] }) {
  return (
    <ul className="songs">
      {songs.map((song) => (
        <SongCard key={song.id} song={song} />
      ))}
    </ul>
  )
}

function SongCard({ song }: { song: Song }) {
  const { t } = useTranslation()
  const remove = useDeleteSong()
  const confirm = useConfirm()
  const retry = useRetrySong()
  // Uploaded songs keep their separated voice, so their lyrics can be redone.
  const canRedoLyrics = song.is_owner && song.source === 'upload' && song.has_vocals_track

  return (
    <li className="song">
      <div className="song-main">
        <strong>{song.title}</strong>
        <span className="muted small">{song.artist}</span>
        <span className="tags">
          {song.duration_seconds != null && <span className="tag">{formatDuration(song.duration_seconds)}</span>}
          {song.language && <span className="tag">{song.language.toUpperCase()}</span>}
          {song.is_duet && <span className="tag host">{t('songs.duet')}</span>}
          {song.source === 'upload' && <span className="tag">{t('songs.uploaded')}</span>}
          {song.source === 'import' && <span className="tag">{t('songs.imported')}</span>}
        </span>
      </div>

      {song.status === 'processing' && (
        <div className="progress-block" aria-live="polite">
          <div className="progress">
            <div className="progress-bar" style={{ width: `${song.progress_pct}%` }} />
          </div>
          <span className="muted small">
            {t(`songs.steps.${song.progress_step}`, { defaultValue: song.progress_step })} {song.progress_pct}%
          </span>
        </div>
      )}

      {song.status === 'ready' && song.error_code && (
        <span className="error small">
          {t('lyrics.redoFailed')}: {t(`errors.${song.error_code}`, { defaultValue: t('errors.unknown_error') })}
        </span>
      )}

      {song.status === 'failed' && (
        <div className="stack tight">
          <span className="error small">
            {t('songs.failed')}: {t(`errors.${song.error_code ?? 'unknown_error'}`, { defaultValue: t('errors.unknown_error') })}
          </span>
          {song.is_owner && (
            <div className="row wrap">
              <button className="button small" onClick={() => retry.mutate(song.id)} disabled={retry.isPending}>
                {t('songs.retry')}
              </button>
              {canRedoLyrics && (
                <Link className="button small" to={`/songs/${song.id}/lyrics`}>
                  {t('lyrics.add')}
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      <div className="row wrap song-actions">
        {song.status === 'ready' && (
          <>
            <Link className="button small" to={`/songs/${song.id}/edit`}>
              {song.is_owner ? t('songs.edit') : t('songs.view')}
            </Link>
            <a className="button small" href={`/api/songs/${song.id}/export`} download>
              {t('songs.export')}
            </a>
            {canRedoLyrics && (
              <Link className="button small" to={`/songs/${song.id}/lyrics`}>
                {t('lyrics.redoButton')}
              </Link>
            )}
          </>
        )}
        {song.is_owner && (
          <button
            className="link-button danger small"
            onClick={async () => {
              if (await confirm({ title: t('songs.confirmDelete', { title: song.title }), message: t('songs.deleteWarning'), confirmLabel: t('songs.delete'), danger: true })) remove.mutate(song.id)
            }}
          >
            {t('songs.delete')}
          </button>
        )}
      </div>
      <ErrorText error={remove.error ?? retry.error} />
    </li>
  )
}
