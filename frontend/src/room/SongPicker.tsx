import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import type { Song } from '../api/types'
import ErrorText from '../components/ErrorText'
import { formatDuration } from '../lib/format'
import { Button, SkeletonList, SongCover, cx } from '../ui'

/** What the room can sing: the host's own ready songs, then the starter library. */
export default function SongPicker({ code, selectedId, isHost, onPick }: {
  code: string
  selectedId: string | null
  isHost: boolean
  onPick: (song: Song) => void
}) {
  const { t } = useTranslation()
  const songs = useQuery({ queryKey: ['room-songs', code], queryFn: () => api<Song[]>(`/api/rooms/${code}/songs`) })

  if (songs.isError) return <ErrorText error={songs.error} />
  if (!songs.data) return <SkeletonList rows={4} height={68} />
  const hosts = songs.data.filter((s) => s.source !== 'starter')
  const starter = songs.data.filter((s) => s.source === 'starter')

  return (
    <div className="stack">
      {[
        { label: isHost ? t('game.song.mine') : t('game.song.hosts'), list: hosts },
        { label: t('game.song.starter'), list: starter },
      ]
        .filter((group) => group.list.length > 0)
        .map((group) => (
          <div key={group.label} className="stack tight">
            <span className="eyebrow">{group.label}</span>
            <ul className="pick-list">
              {group.list.map((song) => {
                const chosen = song.id === selectedId
                return (
                  <li key={song.id} className={cx('pick', chosen && 'selected')}>
                    <SongCover song={song} size={48} />
                    <div className="pick-main">
                      <strong>{song.title}</strong>
                      <span className="muted small">{song.artist}</span>
                    </div>
                    <span className="tags">
                      <span className="tag">{formatDuration(song.duration_seconds)}</span>
                      {song.is_duet && <span className="tag host">{t('songs.duet')}</span>}
                    </span>
                    <Button size="sm" variant={chosen ? 'secondary' : 'primary'} icon={chosen ? Check : undefined} disabled={chosen}
                      onClick={() => onPick(song)} aria-label={`${chosen ? t('game.song.chosen') : t('game.song.choose')}: ${song.title}`}>
                      {chosen ? t('game.song.chosen') : t('game.song.choose')}
                    </Button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
    </div>
  )
}
