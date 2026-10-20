import { Check, CircleAlert, Music, Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatDuration } from '../lib/format'
import { Badge, Button, Card, EmptyState, SongCover } from '../ui'
import type { ClientMessage, RoomSong } from './protocol'
import SongPicker from './SongPicker'

export type SongLoad = 'none' | 'loading' | 'loaded' | 'failed' // 'none': this player has no mic on yet

interface Props {
  code: string
  song: RoomSong | null
  load: SongLoad
  isHost: boolean
  anyoneReady: boolean
  send: (message: ClientMessage) => void
}

/** Sing Together: the chosen song with its cover, whether it's loaded here, and (host) start + pick. */
export default function SongPanel({ code, song, load, isHost, anyoneReady, send }: Props) {
  const { t } = useTranslation()
  const canStart = !!song && anyoneReady

  return (
    <Card eyebrow={t('game.song.next')} icon={Music} wide>
      {song ? (
        <div className="chosen-song">
          <SongCover song={song} size={64} />
          <div className="pick-main">
            <strong>{song.title}</strong>
            <span className="muted small">{song.artist}</span>
            <span className="tags">
              <span className="tag">{formatDuration(song.duration_seconds)}</span>
              {song.is_duet && <span className="tag host">{t('songs.duet')}</span>}
            </span>
          </div>
          <SongLoadBadge load={load} />
        </div>
      ) : (
        <EmptyState compact text={isHost ? t('game.song.noneHost') : t('game.song.none')} />
      )}

      {isHost ? (
        <>
          {/* On phones the same button sits in the bar at the bottom of the screen. */}
          <Button variant="primary" size="lg" block icon={Play} disabled={!canStart} onClick={() => send({ type: 'start' })} className="hide-on-phone">
            {t('game.start.button')}
          </Button>
          {!canStart && <p className="muted small">{!song ? t('game.start.needSong') : t('game.start.needReady')}</p>}
          <details className="picker" open={!song}>
            <summary>{song ? t('game.song.change') : t('game.song.pick')}</summary>
            <SongPicker code={code} selectedId={song?.id ?? null} isHost onPick={(picked) => send({ type: 'select_song', song_id: picked.id })} />
          </details>
        </>
      ) : (
        <p className="muted small">{t('game.start.waiting')}</p>
      )}
    </Card>
  )
}

function SongLoadBadge({ load }: { load: SongLoad }) {
  const { t } = useTranslation()
  if (load === 'failed')
    return (
      <Badge tone="danger" icon={CircleAlert}>
        {t('game.song.loadFailed')}
      </Badge>
    )
  if (load === 'loaded')
    return (
      <Badge tone="ok" icon={Check}>
        {t('game.song.loaded')}
      </Badge>
    )
  if (load === 'loading')
    return (
      <span className="song-loading small muted">
        <span className="spinner" aria-hidden /> {t('game.song.loading')}
      </span>
    )
  return null
}
