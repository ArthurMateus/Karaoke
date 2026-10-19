// The Pitch Lane brand: notes on a lane, the thing players watch while singing.

/** Logo mark: three notes stepping up, like a melody in the note lane. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="brand-mark">
      <rect width="32" height="32" rx="9" fill="var(--ink)" />
      <rect x="5" y="19" width="9" height="4" rx="2" fill="var(--violet)" />
      <rect x="12" y="13" width="8" height="4" rx="2" fill="var(--violet)" />
      <rect x="18" y="8" width="9" height="4" rx="2" fill="var(--coral)" />
    </svg>
  )
}

// Target notes as [x, pitch row, width]; the singer's pitch traced over the first half.
const NOTES: [number, number, number][] = [
  [8, 46, 30], [42, 40, 30], [80, 34, 44], [128, 28, 44], [176, 34, 22], [204, 22, 40], [250, 40, 34], [290, 46, 30],
  [330, 36, 30], [366, 30, 40], [412, 24, 30], [448, 32, 40],
]
const TRACE: [number, number][] = [
  [0, 47], [20, 46], [42, 41], [70, 40], [82, 35], [110, 33], [128, 29], [150, 27], [168, 30], [182, 34], [200, 33], [210, 26], [224, 22],
]

/** A strip of the note lane, used as artwork on the home page. */
export function LaneArt() {
  const height = 120
  const y = (v: number) => (v / 60) * height
  const now = 224
  return (
    <svg className="lane-art" viewBox={`0 0 500 ${height}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <line key={i} x1={0} x2={500} y1={((i + 1) * height) / 6} y2={((i + 1) * height) / 6} className="lane-grid" />
      ))}
      {NOTES.map(([x, v, w], i) => (
        <rect key={i} x={x} y={y(v) - 5} width={w} height={10} rx={5} className={x + w <= now ? 'lane-note hit' : 'lane-note'} />
      ))}
      <polyline className="lane-trace" points={TRACE.map(([x, v]) => `${x},${y(v)}`).join(' ')} />
      <line x1={now} x2={now} y1={0} y2={height} className="lane-now" />
      <circle cx={now} cy={y(22)} r={5} className="lane-dot" />
    </svg>
  )
}
