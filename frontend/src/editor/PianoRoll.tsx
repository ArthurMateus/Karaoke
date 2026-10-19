import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { lineEnd, lineStart, moveNote, pitchName, resizeNote, type EditorChart, type EditorNote } from './chartModel'

const ROW = 18 // pixels per semitone
const EDGE = 8 // pixels at a note's right end that resize instead of move

interface Drag {
  pointerId: number
  mode: 'move' | 'resize'
  x: number
  y: number
  base: EditorChart
  noteIndex: number
}

interface Props {
  chart: EditorChart
  lineIndex: number
  selectedNote: number | null
  currentBeat: number | null
  readOnly: boolean
  onSelect: (noteIndex: number) => void
  onDragStart: () => void // remember the chart for undo
  onLiveChange: (next: EditorChart, selectedNote: number) => void
}

/** One lyric line as bars on a pitch grid. */
export default function PianoRoll(props: Props) {
  const { chart, lineIndex, selectedNote, currentBeat, readOnly } = props
  const wrapper = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  const [drag, setDrag] = useState<Drag | null>(null)

  useEffect(() => {
    if (!wrapper.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(wrapper.current)
    return () => observer.disconnect()
  }, [])

  // Keep the view steady while dragging: measure from the chart as it was when the drag began.
  const viewLine = (drag?.base ?? chart).lines[lineIndex] ?? chart.lines[lineIndex]
  const line = chart.lines[lineIndex]
  if (!line || !viewLine) return null

  const from = lineStart(viewLine) - 4
  const to = lineEnd(viewLine) + 4
  const pitches = viewLine.notes.map((n) => n.pitch)
  const low = Math.min(...pitches) - 4
  const high = Math.max(Math.max(...pitches) + 4, low + 14)
  const beatWidth = width / (to - from)
  const height = (high - low + 1) * ROW

  const x = (beat: number) => (beat - from) * beatWidth
  const y = (pitch: number) => (high - pitch) * ROW

  const onPointerDown = (e: PointerEvent<SVGRectElement>, noteIndex: number, note: EditorNote) => {
    props.onSelect(noteIndex)
    if (readOnly) return
    const rect = e.currentTarget.getBoundingClientRect()
    const mode = e.clientX > rect.right - EDGE && note.length > 1 ? 'resize' : 'move'
    e.currentTarget.setPointerCapture(e.pointerId)
    props.onDragStart()
    setDrag({ pointerId: e.pointerId, mode, x: e.clientX, y: e.clientY, base: chart, noteIndex })
  }

  const onPointerMove = (e: PointerEvent<SVGRectElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return
    const dBeats = Math.round((e.clientX - drag.x) / beatWidth)
    const dPitch = -Math.round((e.clientY - drag.y) / ROW)
    const next =
      drag.mode === 'move'
        ? moveNote(drag.base, lineIndex, drag.noteIndex, dBeats, dPitch)
        : resizeNote(drag.base, lineIndex, drag.noteIndex, dBeats)
    // Moving can reorder notes; follow the dragged one.
    const original = drag.base.lines[lineIndex].notes[drag.noteIndex]
    const moved = next.lines[lineIndex]?.notes.findIndex(
      (n) => n.text === original.text && n.kind === original.kind &&
        n.start === Math.max(0, original.start + (drag.mode === 'move' ? dBeats : 0)),
    )
    props.onLiveChange(next, moved != null && moved >= 0 ? moved : drag.noteIndex)
  }

  const endDrag = () => setDrag(null)

  return (
    <div className="piano-roll" ref={wrapper}>
      <svg width={width} height={height} role="img" aria-label="notes">
        {Array.from({ length: high - low + 1 }, (_, i) => high - i).map((pitch) => (
          <rect key={pitch} x={0} y={y(pitch)} width={width} height={ROW}
            className={(pitch + 60) % 12 === 0 ? 'roll-row c' : pitch % 2 ? 'roll-row' : 'roll-row alt'} />
        ))}
        {Array.from({ length: Math.ceil((to - from) / 4) + 1 }, (_, i) => Math.ceil(from / 4) * 4 + i * 4).map((beat) => (
          <line key={beat} x1={x(beat)} x2={x(beat)} y1={0} y2={height} className="roll-beat" />
        ))}
        {Array.from({ length: high - low + 1 }, (_, i) => high - i)
          .filter((p) => (p + 60) % 12 === 0)
          .map((p) => (
            <text key={`label-${p}`} x={4} y={y(p) + ROW - 5} className="roll-label">{pitchName(p)}</text>
          ))}

        {line.notes.map((note, i) => (
          <g key={i}>
            <rect
              x={x(note.start) + 1}
              y={y(note.pitch) + 2}
              width={Math.max(4, note.length * beatWidth - 2)}
              height={ROW - 4}
              rx={4}
              className={`roll-note ${note.kind} ${i === selectedNote ? 'selected' : ''} ${readOnly ? '' : 'editable'}`}
              onPointerDown={(e) => onPointerDown(e, i, note)}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            />
            <text x={x(note.start) + 3} y={y(note.pitch) - 2} className="roll-text">
              {note.text.trim() || '·'}
            </text>
          </g>
        ))}

        {currentBeat != null && currentBeat >= from && currentBeat <= to && (
          <line x1={x(currentBeat)} x2={x(currentBeat)} y1={0} y2={height} className="roll-playhead" />
        )}
      </svg>
    </div>
  )
}
