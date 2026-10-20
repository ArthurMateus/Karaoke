import { Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDuration } from '../lib/format'
import { cx } from './cx'

/** A replay player: one big play/pause button, a seek bar and the time. Styles in styles/sing.css. */
export function ReplayPlayer({ src, label, className }: { src: string; label: string; className?: string }) {
  const { t } = useTranslation()
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState<number | null>(null)

  // Leaving the screen stops the sound.
  useEffect(() => () => audio.current?.pause(), [])

  const toggle = () => {
    const el = audio.current
    if (!el) return
    if (el.paused) void el.play().catch(() => setPlaying(false))
    else el.pause()
  }
  const seek = (to: number) => {
    const el = audio.current
    if (!el || !Number.isFinite(to)) return
    el.currentTime = to
    setTime(to)
  }

  const known = duration !== null && Number.isFinite(duration) && duration > 0
  const part = known ? Math.min(1, time / duration) : 0
  return (
    <div className={cx('replay-player', playing && 'playing', className)} role="group" aria-label={label}>
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
      />
      <button type="button" className="replay-toggle" onClick={toggle} aria-label={playing ? t('game.replay.pause') : t('game.replay.play')}>
        {playing ? <Pause size={22} fill="currentColor" aria-hidden /> : <Play size={22} fill="currentColor" aria-hidden />}
      </button>
      <div className="replay-track">
        <input
          type="range"
          className="replay-seek"
          min={0}
          max={known ? duration : 1}
          step={0.1}
          value={known ? Math.min(time, duration) : 0}
          disabled={!known}
          onChange={(e) => seek(Number(e.currentTarget.value))}
          aria-label={t('game.replay.seek')}
          aria-valuetext={known ? t('game.replay.position', { time: formatDuration(time), total: formatDuration(duration) }) : undefined}
          style={{ '--part': `${part * 100}%` } as CSSProperties}
        />
        <span className="replay-time" aria-hidden>
          <span>{formatDuration(time)}</span>
          <span>{known ? formatDuration(duration) : '-:--'}</span>
        </span>
      </div>
    </div>
  )
}
