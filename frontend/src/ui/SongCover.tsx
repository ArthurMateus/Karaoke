import type { CSSProperties } from 'react'
import { coverLetters, coverNotes, songHue } from '../lib/songColor'
import { cx } from './cx'

/** Made-up cover art for a song: a gradient in the song's colour, a little note lane and its first letters.
 * Decorative: the title is always written next to it. */
export function SongCover({ song, size = 56, className }: { song: { id: string; title: string }; size?: number; className?: string }) {
  const hue = songHue(song.id)
  const letters = coverLetters(song.title)
  return (
    <span
      className={cx('song-cover', className)}
      style={{ '--hue': hue, '--cover-size': `${size}px` } as CSSProperties}
      aria-hidden
    >
      <svg viewBox="0 0 64 64" preserveAspectRatio="none">
        {[22, 32, 42, 52].map((y) => (
          <line key={y} x1={0} x2={64} y1={y} y2={y} className="cover-grid" />
        ))}
        {coverNotes(song.id).map(([x, y, w], i) => (
          <rect key={i} x={x} y={y - 2.5} width={w} height={5} rx={2.5} className={i < 2 ? 'cover-note hit' : 'cover-note'} />
        ))}
      </svg>
      {letters && <span className="cover-letters">{letters}</span>}
    </span>
  )
}
