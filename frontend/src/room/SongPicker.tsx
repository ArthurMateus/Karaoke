import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import type { Song } from '../api/types'
import ErrorText from '../components/ErrorText'
import { formatDuration } from '../lib/format'

/** The host's list: their own ready songs, then the starter library. */
export default function SongPicker({ code, selectedId, onPick }: { code: string; selectedId: string | null; onPick: (id: string) => void }) {
  const { t } = useTranslation()
  const songs = useQuery({ queryKey: ['room-songs', code], queryFn: () => api<Song[]>(`/api/rooms/${code}/songs`) })

  if (songs.isError) return <ErrorText error={songs.error} />
  if (!songs.data) return null
  const mine = songs.data.filter((s) => s.is_owner)
  const starter = songs.data.filter((s) => s.source === 'starter')

  return (
    <div className="stack">
      {[
        { label: t('game.song.mine'), list: mine },
        { label: t('game.song.starter'), list: starter },
      ]
        .filter((group) => group.list.length > 0)
        .map((group) => (
          <div key={group.label} className="stack tight">
            <span className="eyebrow">{group.label}</span>
            <ul className="pick-list">
              {group.list.map((song) => (
                <li key={song.id} className={`pick ${song.id === selectedId ? 'selected' : ''}`}>
                  <div className="pick-main">
                    <strong>{song.title}</strong>
                    <span className="muted small">{song.artist}</span>
                  </div>
                  <span className="tags">
                    <span className="tag">{formatDuration(song.duration_seconds)}</span>
                    {song.is_duet && <span className="tag host">{t('songs.duet')}</span>}
                  </span>
                  <button
                    className={`button small ${song.id === selectedId ? '' : 'primary'}`}
                    disabled={song.id === selectedId}
                    onClick={() => onPick(song.id)}
                  >
                    {song.id === selectedId ? t('game.song.chosen') : t('game.song.choose')}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  )
}
