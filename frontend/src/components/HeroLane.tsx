// The home page's artwork: the note lane scrolling slowly. Notes turn violet as they cross the
// "now" line and the sung pitch is drawn over them, like in the game. Only `transform` moves
// (one CSS animation); with reduced motion it stands still.
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { formatScore } from '../lib/format'

const W = 520 // one repeat of the pattern
const H = 200
// [x, row 0-10 from the top, width]: a little melody, then the same again.
const MELODY: [number, number, number][] = [
  [10, 7, 46], [62, 6, 40], [108, 4, 58], [172, 3, 40], [218, 5, 30], [254, 2, 52], [312, 6, 44],
  [362, 7, 30], [398, 5, 40], [444, 3, 34], [484, 4, 30],
]
const NOW = 210
const y = (row: number) => 24 + row * 15

// The pitch line follows the middle of each note, with small wobbles in between.
function tracePoints(offset: number): string {
  return MELODY.flatMap(([x, row, w], i) => {
    const mid = y(row) + 6
    const wobble = i % 2 ? 2 : -2
    return [`${offset + x + 4},${mid + wobble}`, `${offset + x + w / 2},${mid}`, `${offset + x + w - 4},${mid - wobble}`]
  }).join(' ')
}

export default function HeroLane() {
  const { t, i18n } = useTranslation()
  const clip = `hero${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const notes = (className: string) =>
    [0, W].flatMap((offset) =>
      MELODY.map(([x, row, w], i) => (
        <rect key={`${offset}-${i}`} x={offset + x} y={y(row)} width={w} height={12} rx={6} className={className} />
      )),
    )
  return (
    <div className="hero-art" aria-hidden>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="hero-lane">
        <defs>
          <clipPath id={`${clip}-sung`}>
            <rect x={0} y={0} width={NOW} height={H} />
          </clipPath>
        </defs>
        {Array.from({ length: 6 }, (_, i) => (
          <line key={i} x1={0} x2={W} y1={30 + i * 30} y2={30 + i * 30} className="lane-grid" />
        ))}
        <g className="hero-scroll">{notes('lane-note')}</g>
        <g clipPath={`url(#${clip}-sung)`}>
          <g className="hero-scroll">
            {notes('lane-note hit')}
            <polyline className="lane-trace" points={`${tracePoints(0)} ${tracePoints(W)}`} />
          </g>
        </g>
        <line x1={NOW} x2={NOW} y1={0} y2={H} className="lane-now" />
      </svg>
      <span className="hero-chip hero-rating">{t('game.sing.ratings.perfect')}</span>
      <span className="hero-chip hero-score">
        <b>{formatScore(8450, i18n.language)}</b> {t('game.sing.points')}
      </span>
      <span className="hero-singers">
        {['A', 'L', 'B'].map((letter, i) => (
          <span key={letter} className="avatar sm" style={{ ['--avatar-color' as string]: ['var(--violet)', 'var(--coral)', 'var(--teal)'][i] }}>
            {letter}
          </span>
        ))}
      </span>
    </div>
  )
}
