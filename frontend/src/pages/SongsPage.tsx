import { Download, Eye, FileMusic, FileText, Library, LogIn, Mic, Music, Pencil, RotateCcw, Search, Trash, Upload, Users, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDeleteSong, useMe, useRetrySong, useSongs } from '../api/hooks'
import type { Song } from '../api/types'
import ConversionSteps from '../components/ConversionSteps'
import ErrorText from '../components/ErrorText'
import { formatDuration } from '../lib/format'
import { Badge, Button, ButtonAnchor, ButtonLink, EmptyState, IconButton, PageHeader, Section, Segmented, Skeleton, SongCover, cx, useConfirm } from '../ui'

type Scope = 'all' | 'mine' | 'starter'
interface Filters {
  query: string
  scope: Scope
  language: string // '' = any
  duet: boolean
}
const NO_FILTERS: Filters = { query: '', scope: 'all', language: '', duet: false }

/** "Canção" and "cancao" match: lower case, no accents. */
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

function matches(song: Song, f: Filters): boolean {
  if (f.duet && !song.is_duet) return false
  if (f.language && song.language.toLowerCase() !== f.language) return false
  const q = fold(f.query.trim())
  return !q || fold(`${song.title} ${song.artist}`).includes(q)
}

export default function SongsPage() {
  const { t } = useTranslation()
  const me = useMe()
  const songs = useSongs()
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const user = me.data?.user
  const hasAccount = !!user && !user.is_guest

  const languages = useMemo(() => {
    const all = [...(songs.data?.mine ?? []), ...(songs.data?.starter ?? [])]
    return [...new Set(all.map((s) => s.language.toLowerCase()).filter(Boolean))].sort()
  }, [songs.data])

  if (songs.isError) return <ErrorText error={songs.error} />
  if (!songs.data || me.isPending) return <SongsSkeleton />
  const { starter, mine, conversions_left, conversions_per_month } = songs.data

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }))
  const filtering = filters.query.trim() !== '' || filters.language !== '' || filters.duet
  const showMine = hasAccount && filters.scope !== 'starter'
  const showStarter = filters.scope !== 'mine'
  const mineShown = mine.filter((s) => matches(s, filters))
  const starterShown = starter.filter((s) => matches(s, filters))
  const nothing = (!showMine || mineShown.length === 0) && (!showStarter || starterShown.length === 0)
  const noneLeft = conversions_left === 0

  return (
    <div className="songs-page">
      <PageHeader
        icon={Music}
        title={t('songs.title')}
        subtitle={t('songs.subtitle')}
        actions={
          hasAccount ? (
            <>
              <ButtonLink variant="primary" icon={Upload} to="/songs/upload" className={noneLeft ? 'disabled' : undefined} aria-disabled={noneLeft || undefined}>
                {t('songs.upload')}
              </ButtonLink>
              <ButtonLink icon={FileMusic} to="/songs/import">
                {t('songs.import')}
              </ButtonLink>
            </>
          ) : undefined
        }
      />

      <div className="song-filters" role="search">
        <div className="song-search">
          <Search size={18} aria-hidden />
          <input
            className="input"
            type="search"
            value={filters.query}
            onChange={(e) => set({ query: e.target.value })}
            placeholder={t('songs.searchPlaceholder')}
            aria-label={t('songs.search')}
          />
        </div>
        <div className="song-filter-row">
          {hasAccount && (
            <Segmented<Scope>
              size="sm"
              label={t('songs.show')}
              value={filters.scope}
              onChange={(scope) => set({ scope })}
              options={[
                { value: 'all', label: t('songs.scopeAll') },
                { value: 'mine', label: t('songs.scopeMine') },
                { value: 'starter', label: t('songs.scopeStarter') },
              ]}
            />
          )}
          {languages.length > 1 && (
            <select className="input small song-language" value={filters.language} onChange={(e) => set({ language: e.target.value })} aria-label={t('songs.languageFilter')}>
              <option value="">{t('songs.anyLanguage')}</option>
              {languages.map((code) => (
                <option key={code} value={code}>
                  {t(`upload.languages.${code}`, { defaultValue: code.toUpperCase() })}
                </option>
              ))}
            </select>
          )}
          <button type="button" className={cx('filter-toggle', filters.duet && 'on')} aria-pressed={filters.duet} onClick={() => set({ duet: !filters.duet })}>
            <Users size={16} aria-hidden />
            {t('songs.duetsOnly')}
          </button>
          {(filtering || filters.scope !== 'all') && (
            <Button variant="ghost" size="sm" icon={X} onClick={() => setFilters(NO_FILTERS)}>
              {t('songs.clearFilters')}
            </Button>
          )}
        </div>
      </div>

      {nothing && filtering ? (
        <EmptyState
          title={t('songs.noMatch')}
          text={t('songs.noMatchText')}
          action={
            <Button size="sm" icon={X} onClick={() => setFilters(NO_FILTERS)}>
              {t('songs.clearFilters')}
            </Button>
          }
        />
      ) : (
        <>
          {showMine && (
            <Section title={t('songs.mine')} icon={Library} className="song-section"
              actions={conversions_per_month != null && (
                <Badge tone={noneLeft ? 'warn' : 'violet'}>{t('songs.quota', { left: conversions_left, total: conversions_per_month })}</Badge>
              )}>
              <p className="muted small">{t('songs.private')}</p>
              {mine.length === 0 ? (
                <EmptyState
                  title={t('songs.empty')}
                  text={t('songs.emptyText')}
                  action={!noneLeft && (
                    <ButtonLink variant="primary" size="sm" icon={Upload} to="/songs/upload">
                      {t('songs.upload')}
                    </ButtonLink>
                  )}
                />
              ) : mineShown.length === 0 ? (
                <p className="muted">{t('songs.noMatch')}</p>
              ) : (
                <SongGrid songs={mineShown} />
              )}
            </Section>
          )}

          {!hasAccount && filters.scope !== 'starter' && (
            <div className="card wide songs-sign-in">
              <span className="card-icon" aria-hidden>
                <Upload size={18} />
              </span>
              <p>{t('songs.signInToUpload')}</p>
              <ButtonLink size="sm" variant="primary" icon={LogIn} to="/sign-in?next=/songs">
                {t('nav.signIn')}
              </ButtonLink>
            </div>
          )}

          {showStarter && starterShown.length > 0 && (
            <Section title={t('songs.starter')} icon={Music} className="song-section">
              <p className="muted small">{t('songs.starterNote')}</p>
              <SongGrid songs={starterShown} />
            </Section>
          )}
        </>
      )}
    </div>
  )
}

/** Placeholders the size of the header, filters and a few cards. */
function SongsSkeleton() {
  return (
    <div className="songs-page" aria-busy="true">
      <div className="page-header">
        <Skeleton width={48} height={48} radius={14} />
        <div className="page-titles">
          <Skeleton width={160} height={32} />
          <Skeleton width="70%" height={18} />
        </div>
      </div>
      <Skeleton height={48} radius="var(--r-control)" />
      <ul className="song-grid">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i}>
            <Skeleton height={168} radius="var(--r-card)" />
          </li>
        ))}
      </ul>
    </div>
  )
}

function SongGrid({ songs }: { songs: Song[] }) {
  return (
    <ul className="song-grid">
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
  const ready = song.status === 'ready'

  const onDelete = async () => {
    if (await confirm({ title: t('songs.confirmDelete', { title: song.title }), message: t('songs.deleteWarning'), confirmLabel: t('songs.delete'), danger: true })) {
      remove.mutate(song.id)
    }
  }

  return (
    <li className={cx('song-card', song.status)}>
      <div className="song-card-head">
        <SongCover song={song} size={64} />
        <div className="song-card-titles">
          <strong className="song-card-title">{song.title}</strong>
          {song.artist && <span className="muted small song-card-artist">{song.artist}</span>}
          <span className="tags">
            {song.duration_seconds != null && <span className="tag">{formatDuration(song.duration_seconds)}</span>}
            {song.language && <span className="tag">{song.language.toUpperCase()}</span>}
            {song.is_duet && <Badge tone="violet" icon={Users}>{t('songs.duet')}</Badge>}
            {song.source === 'upload' && <span className="tag">{t('songs.uploaded')}</span>}
            {song.source === 'import' && <span className="tag">{t('songs.imported')}</span>}
          </span>
        </div>
        {song.is_owner && (
          <IconButton icon={Trash} size="sm" className="song-delete" label={`${t('songs.delete')}: ${song.title}`} onClick={onDelete} disabled={remove.isPending} />
        )}
      </div>

      {song.status === 'processing' && <ConversionSteps song={song} />}

      {ready && song.error_code && (
        <p className="error small">
          {t('lyrics.redoFailed')}: {t(`errors.${song.error_code}`, { defaultValue: t('errors.unknown_error') })}
        </p>
      )}

      {song.status === 'failed' && (
        <div className="song-failed">
          <p className="error small">
            {t('songs.failed')}: {t(`errors.${song.error_code ?? 'unknown_error'}`, { defaultValue: t('errors.unknown_error') })}
          </p>
          {song.is_owner && (
            <div className="row wrap">
              <Button size="sm" icon={RotateCcw} onClick={() => retry.mutate(song.id)} loading={retry.isPending}>
                {t('songs.retry')}
              </Button>
              {canRedoLyrics && (
                <ButtonLink size="sm" icon={FileText} to={`/songs/${song.id}/lyrics`}>
                  {t('lyrics.add')}
                </ButtonLink>
              )}
            </div>
          )}
        </div>
      )}

      {ready && (
        <div className="song-actions">
          <ButtonLink size="sm" variant="primary" icon={Mic} to={`/solo/${song.id}`} aria-label={`${t('songs.sing')}: ${song.title}`}>
            {t('songs.sing')}
          </ButtonLink>
          <ButtonLink size="sm" icon={song.is_owner ? Pencil : Eye} to={`/songs/${song.id}/edit`}>
            {song.is_owner ? t('songs.edit') : t('songs.view')}
          </ButtonLink>
          {canRedoLyrics && (
            <ButtonLink size="sm" icon={FileText} to={`/songs/${song.id}/lyrics`}>
              {t('lyrics.redoButton')}
            </ButtonLink>
          )}
          <ButtonAnchor size="sm" variant="ghost" icon={Download} href={`/api/songs/${song.id}/export`} download aria-label={`${t('songs.export')}: ${song.title}`}>
            {t('songs.export')}
          </ButtonAnchor>
        </div>
      )}
      <ErrorText error={remove.error ?? retry.error} />
    </li>
  )
}
