// The chart as the editor sees it (mirrors backend/app/charts/editor.py).
// Every edit is a pure function that returns a new chart, which keeps undo
// simple and makes the logic easy to test.

export type NoteKind = 'normal' | 'golden' | 'freestyle' | 'rap' | 'rap_golden'
export type Singer = 'P1' | 'P2' | 'both'

export interface EditorNote {
  kind: NoteKind
  start: number // UltraStar beats
  length: number
  pitch: number // semitones, 0 = middle C
  text: string // a leading space starts a new word; "~" holds the previous syllable
}

export interface EditorLine {
  singer: Singer
  notes: EditorNote[]
}

export interface EditorChart {
  title: string
  artist: string
  language: string
  bpm: number
  gap_ms: number
  singers: Partial<Record<'P1' | 'P2', string>>
  lines: EditorLine[]
}

export const NOTE_KINDS: NoteKind[] = ['normal', 'golden', 'freestyle', 'rap', 'rap_golden']
export const MIN_PITCH = -48
export const MAX_PITCH = 48

// --- Time ------------------------------------------------------------------------

export function secondsPerBeat(chart: EditorChart): number {
  return 60 / (chart.bpm * 4)
}

export function beatToSeconds(chart: EditorChart, beat: number): number {
  return chart.gap_ms / 1000 + beat * secondsPerBeat(chart)
}

export function secondsToBeat(chart: EditorChart, seconds: number): number {
  return (seconds - chart.gap_ms / 1000) / secondsPerBeat(chart)
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, seconds)
  const minutes = Math.floor(s / 60)
  return `${minutes}:${(s - minutes * 60).toFixed(1).padStart(4, '0')}`
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** 0 -> "C4" (middle C), 7 -> "G4". */
export function pitchName(pitch: number): string {
  const midi = pitch + 60
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`
}

// --- Reading -----------------------------------------------------------------------

export const lineStart = (line: EditorLine) => line.notes[0].start
export const lineEnd = (line: EditorLine) => Math.max(...line.notes.map((n) => n.start + n.length))

export function lineText(line: EditorLine): string {
  return line.notes
    .map((n) => (n.text === '~' ? '' : n.text))
    .join('')
    .trim()
}

/** Index of the line being sung at `beat` (or the next one), for following playback. */
export function lineAtBeat(chart: EditorChart, beat: number): number {
  let best = 0
  chart.lines.forEach((line, i) => {
    if (lineStart(line) <= beat + 8) best = i
  })
  return best
}

export const isDuet = (chart: EditorChart) => chart.lines.some((l) => l.singer !== 'P1')

// --- Editing -----------------------------------------------------------------------

function clone(chart: EditorChart): EditorChart {
  return structuredClone(chart)
}

const sortNotes = (line: EditorLine) => line.notes.sort((a, b) => a.start - b.start)
const sortLines = (chart: EditorChart) => chart.lines.sort((a, b) => lineStart(a) - lineStart(b))

export function updateMeta(chart: EditorChart, changes: Partial<Omit<EditorChart, 'lines'>>): EditorChart {
  return { ...clone(chart), ...changes }
}

export function setSinger(chart: EditorChart, lineIndex: number, singer: Singer): EditorChart {
  const next = clone(chart)
  next.lines[lineIndex].singer = singer
  return next
}

export function shiftLine(chart: EditorChart, lineIndex: number, beats: number): EditorChart {
  const next = clone(chart)
  const line = next.lines[lineIndex]
  const delta = Math.max(beats, -lineStart(line)) // never before the song starts
  for (const note of line.notes) note.start += delta
  sortLines(next)
  return next
}

export function updateNote(
  chart: EditorChart,
  lineIndex: number,
  noteIndex: number,
  changes: Partial<EditorNote>,
): EditorChart {
  const next = clone(chart)
  const note = next.lines[lineIndex].notes[noteIndex]
  Object.assign(note, changes)
  note.start = Math.max(0, Math.round(note.start))
  note.length = Math.max(1, Math.round(note.length))
  note.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, Math.round(note.pitch)))
  sortNotes(next.lines[lineIndex])
  sortLines(next)
  return next
}

export function moveNote(chart: EditorChart, lineIndex: number, noteIndex: number, dStart: number, dPitch: number) {
  const note = chart.lines[lineIndex].notes[noteIndex]
  return updateNote(chart, lineIndex, noteIndex, { start: note.start + dStart, pitch: note.pitch + dPitch })
}

export function resizeNote(chart: EditorChart, lineIndex: number, noteIndex: number, dLength: number) {
  const note = chart.lines[lineIndex].notes[noteIndex]
  return updateNote(chart, lineIndex, noteIndex, { length: note.length + dLength })
}

/** Cut a note in two; the second half holds the same syllable ("~"). */
export function splitNote(chart: EditorChart, lineIndex: number, noteIndex: number): EditorChart {
  const note = chart.lines[lineIndex].notes[noteIndex]
  if (note.length < 2) return chart
  const next = clone(chart)
  const first = Math.ceil(note.length / 2)
  next.lines[lineIndex].notes.splice(noteIndex, 1, { ...note, length: first }, {
    ...note,
    start: note.start + first,
    length: note.length - first,
    text: '~',
  })
  return next
}

/** Join a note with the next one in the same line. */
export function mergeWithNext(chart: EditorChart, lineIndex: number, noteIndex: number): EditorChart {
  const notes = chart.lines[lineIndex].notes
  if (noteIndex >= notes.length - 1) return chart
  const next = clone(chart)
  const [a, b] = next.lines[lineIndex].notes.slice(noteIndex, noteIndex + 2)
  const text = b.text === '~' ? a.text : a.text + b.text
  next.lines[lineIndex].notes.splice(noteIndex, 2, { ...a, length: b.start + b.length - a.start, text })
  return next
}

export function deleteNote(chart: EditorChart, lineIndex: number, noteIndex: number): EditorChart {
  const next = clone(chart)
  next.lines[lineIndex].notes.splice(noteIndex, 1)
  if (next.lines[lineIndex].notes.length === 0) next.lines.splice(lineIndex, 1)
  return next
}

/** Start a new line at this note. */
export function breakLineAt(chart: EditorChart, lineIndex: number, noteIndex: number): EditorChart {
  if (noteIndex === 0) return chart
  const next = clone(chart)
  const line = next.lines[lineIndex]
  const moved = line.notes.splice(noteIndex)
  moved[0] = { ...moved[0], text: moved[0].text.replace(/^ /, '') }
  next.lines.splice(lineIndex + 1, 0, { singer: line.singer, notes: moved })
  return next
}

export function joinWithNextLine(chart: EditorChart, lineIndex: number): EditorChart {
  if (lineIndex >= chart.lines.length - 1) return chart
  const next = clone(chart)
  const [line, following] = next.lines.slice(lineIndex, lineIndex + 2)
  const notes = following.notes.map((n, i) => (i === 0 && !n.text.startsWith(' ') && n.text !== '~' ? { ...n, text: ` ${n.text}` } : n))
  line.notes.push(...notes)
  next.lines.splice(lineIndex + 1, 1)
  return next
}

// --- Checking ------------------------------------------------------------------------

export interface Problem {
  code: 'overlap' | 'empty_text' | 'no_notes'
  line: number
  note: number
}

/** Things the server would refuse, so the editor can point at them before saving. */
export function findProblems(chart: EditorChart): Problem[] {
  const problems: Problem[] = []
  if (chart.lines.length === 0) return [{ code: 'no_notes', line: 0, note: 0 }]
  for (const part of ['P1', 'P2'] as const) {
    const sung = chart.lines
      .flatMap((line, li) => (line.singer === part || line.singer === 'both' ? line.notes.map((note, ni) => ({ note, li, ni })) : []))
      .sort((a, b) => a.note.start - b.note.start)
    for (let i = 1; i < sung.length; i++) {
      const before = sung[i - 1].note
      if (sung[i].note.start < before.start + before.length) {
        problems.push({ code: 'overlap', line: sung[i].li, note: sung[i].ni })
      }
    }
  }
  chart.lines.forEach((line, li) =>
    line.notes.forEach((note, ni) => {
      if (!note.text.trim() && note.kind !== 'freestyle') problems.push({ code: 'empty_text', line: li, note: ni })
    }),
  )
  return problems
}
