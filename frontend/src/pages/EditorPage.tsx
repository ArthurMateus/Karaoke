import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { useChart, useSaveChart, useSong } from '../api/hooks'
import type { Song } from '../api/types'
import ErrorText from '../components/ErrorText'
import {
  NOTE_KINDS,
  beatToSeconds,
  breakLineAt,
  deleteNote,
  findProblems,
  formatTime,
  isDuet,
  joinWithNextLine,
  lineAtBeat,
  lineStart,
  lineText,
  mergeWithNext,
  moveNote,
  pitchName,
  resizeNote,
  secondsToBeat,
  setSinger,
  shiftLine,
  splitNote,
  updateMeta,
  updateNote,
  type EditorChart,
  type NoteKind,
  type Singer,
} from '../editor/chartModel'
import PianoRoll from '../editor/PianoRoll'

type Track = 'instrumental' | 'vocals' | 'original'

export default function EditorPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const song = useSong(id)
  const ready = song.data?.status === 'ready'
  const chart = useChart(id, ready)

  if (song.isError) return <ErrorText error={song.error} />
  if (!song.data) return null
  if (!ready) {
    return (
      <section className="card stack">
        <p>{t('editor.notReady')}</p>
        <Link to="/songs">{t('songs.title')}</Link>
      </section>
    )
  }
  if (chart.isError) return <ErrorText error={chart.error} />
  if (!chart.data) return null
  return <Editor song={song.data} initial={chart.data} />
}

function Editor({ song, initial }: { song: Song; initial: EditorChart }) {
  const { t } = useTranslation()
  const readOnly = !song.is_owner
  const [chart, setChart] = useState(initial)
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(initial))
  const [history, setHistory] = useState<EditorChart[]>([])
  const [lineIndex, setLineIndex] = useState(0)
  const [noteIndex, setNoteIndex] = useState<number | null>(null)
  const save = useSaveChart(song.id)

  const dirty = useMemo(() => JSON.stringify(chart) !== savedJson, [chart, savedJson])
  const problems = useMemo(() => findProblems(chart), [chart])

  // --- editing with undo ---
  const edit = useCallback(
    (next: EditorChart, select?: { line?: number; note?: number | null }) => {
      if (readOnly || next === chart) return
      setHistory((h) => [...h.slice(-99), chart])
      setChart(next)
      const li = Math.min(select?.line ?? lineIndex, next.lines.length - 1)
      setLineIndex(Math.max(0, li))
      if (select && 'note' in select) setNoteIndex(select.note ?? null)
      else if (noteIndex != null && noteIndex >= (next.lines[li]?.notes.length ?? 0)) setNoteIndex(null)
    },
    [chart, readOnly, lineIndex, noteIndex],
  )
  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h
      setChart(h[h.length - 1])
      setNoteIndex(null)
      return h.slice(0, -1)
    })
  }, [])

  const onSave = () =>
    save.mutate(chart, { onSuccess: () => setSavedJson(JSON.stringify(chart)) })

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // --- audio ---
  const audio = useRef<HTMLAudioElement>(null)
  const [track, setTrack] = useState<Track>('instrumental')
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(song.duration_seconds ?? 0)
  const tracks: Track[] = ['instrumental', ...(song.has_vocals_track ? ['vocals' as const] : []), ...(song.source !== 'starter' ? ['original' as const] : [])]

  useEffect(() => {
    if (!playing) return
    let frame = 0
    const tick = () => {
      const now = audio.current?.currentTime ?? 0
      setTime(now)
      setLineIndex(lineAtBeat(chart, secondsToBeat(chart, now)))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, chart])

  const togglePlay = useCallback(() => {
    const el = audio.current
    if (!el) return
    if (el.paused) void el.play()
    else el.pause()
  }, [])

  const playLine = (i: number) => {
    const el = audio.current
    if (!el) return
    setLineIndex(i)
    el.currentTime = Math.max(0, beatToSeconds(chart, lineStart(chart.lines[i])) - 1)
    void el.play()
  }

  const switchTrack = (next: Track) => {
    const at = audio.current?.currentTime ?? 0
    setTrack(next)
    requestAnimationFrame(() => {
      if (audio.current) audio.current.currentTime = at
    })
  }

  // --- keyboard ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return
      if (e.key === ' ') {
        e.preventDefault()
        togglePlay()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
      } else if (noteIndex != null && !readOnly) {
        const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }
        const move = moves[e.key]
        if (!move) return
        e.preventDefault()
        if (e.shiftKey && move[0] !== 0) edit(resizeNote(chart, lineIndex, noteIndex, move[0]))
        else {
          const next = moveNote(chart, lineIndex, noteIndex, move[0], move[1])
          const moved = chart.lines[lineIndex].notes[noteIndex]
          const index = next.lines[lineIndex].notes.findIndex((n) => n.text === moved.text && n.start === Math.max(0, moved.start + move[0]))
          edit(next, { note: index >= 0 ? index : noteIndex })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chart, lineIndex, noteIndex, readOnly, edit, undo, togglePlay])

  const line = chart.lines[lineIndex]
  const note = noteIndex != null ? line?.notes[noteIndex] : undefined
  const currentBeat = secondsToBeat(chart, time)
  const duet = isDuet(chart)

  return (
    <div className="editor stack">
      <div className="row spread wrap">
        <div>
          <h1>{chart.title}</h1>
          <p className="muted small">{chart.artist}</p>
        </div>
        {!readOnly && (
          <div className="row wrap">
            <span className={`muted small ${dirty ? 'warn-text' : ''}`}>
              {save.isPending ? t('editor.saving') : dirty ? t('editor.unsaved') : t('editor.saved')}
            </span>
            <button className="button" onClick={undo} disabled={history.length === 0}>{t('editor.undo')}</button>
            <button className="button primary" onClick={onSave} disabled={!dirty || save.isPending || problems.length > 0}>
              {t('editor.save')}
            </button>
          </div>
        )}
      </div>
      {readOnly && <p className="banner">{t('editor.readOnly')}</p>}
      <ErrorText error={save.error} />
      {problems.length > 0 && (
        <ul className="problems">
          {problems.slice(0, 5).map((p, i) => (
            <li key={i}>
              <button className="link-button danger" onClick={() => { setLineIndex(p.line); setNoteIndex(p.note) }}>
                {t(`editor.problems.${p.code}`, { line: p.line + 1 })}
              </button>
            </li>
          ))}
        </ul>
      )}

      <details className="card wide">
        <summary>{t('editor.details')}</summary>
        <div className="form-grid">
          <label>{t('upload.songTitle')}
            <input className="input" value={chart.title} disabled={readOnly} maxLength={200}
              onChange={(e) => edit(updateMeta(chart, { title: e.target.value }))} />
          </label>
          <label>{t('upload.artist')}
            <input className="input" value={chart.artist} disabled={readOnly} maxLength={200}
              onChange={(e) => edit(updateMeta(chart, { artist: e.target.value }))} />
          </label>
          <label>{t('upload.language')}
            <input className="input" value={chart.language} disabled={readOnly} maxLength={40}
              onChange={(e) => edit(updateMeta(chart, { language: e.target.value }))} />
          </label>
          <label>{t('editor.gap')}
            <span className="row">
              <button className="button small" disabled={readOnly} onClick={() => edit(updateMeta(chart, { gap_ms: Math.max(0, chart.gap_ms - 50) }))}>
                − {t('editor.earlier')}
              </button>
              <input className="input number" type="number" value={Math.round(chart.gap_ms)} disabled={readOnly} min={0}
                onChange={(e) => edit(updateMeta(chart, { gap_ms: Math.max(0, Number(e.target.value) || 0) }))} />
              <button className="button small" disabled={readOnly} onClick={() => edit(updateMeta(chart, { gap_ms: chart.gap_ms + 50 }))}>
                + {t('editor.later')}
              </button>
            </span>
            <span className="muted small">{t('editor.gapHelp')}</span>
          </label>
          {duet && (['P1', 'P2'] as const).map((part) => (
            <label key={part}>{t('editor.singerName', { part: t(`editor.singers.${part}`) })}
              <input className="input" value={chart.singers[part] ?? ''} disabled={readOnly} maxLength={40}
                onChange={(e) => edit(updateMeta(chart, { singers: { ...chart.singers, [part]: e.target.value } }))} />
            </label>
          ))}
        </div>
      </details>

      <div className="card wide player">
        <audio
          ref={audio}
          src={`/api/songs/${song.id}/audio/${track}`}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => !playing && setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        />
        <button className="button primary" onClick={togglePlay}>{playing ? `❚❚ ${t('editor.pause')}` : `▶ ${t('editor.play')}`}</button>
        <span className="time">{formatTime(time)} / {formatTime(duration)}</span>
        <input className="seek" type="range" min={0} max={duration || 1} step={0.1} value={time}
          aria-label="seek"
          onChange={(e) => { if (audio.current) audio.current.currentTime = Number(e.target.value); setTime(Number(e.target.value)) }} />
        {tracks.length > 1 && (
          <label className="row small">
            {t('editor.listenTo')}
            <select className="input small" value={track} onChange={(e) => switchTrack(e.target.value as Track)}>
              {tracks.map((tr) => <option key={tr} value={tr}>{t(`editor.tracks.${tr}`)}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="editor-grid">
        <section className="card wide lines-panel">
          <h2>{t('editor.lines')}</h2>
          <ol className="lines">
            {chart.lines.map((l, i) => (
              <li key={i} className={`line-row ${i === lineIndex ? 'active' : ''}`}>
                <button className="line-play" aria-label={t('editor.playLine')} onClick={() => playLine(i)}>▶</button>
                <button className="line-select" onClick={() => { setLineIndex(i); setNoteIndex(null) }}>
                  <span className="muted small">{formatTime(beatToSeconds(chart, lineStart(l)))}</span>
                  {duet && <span className={`tag singer-${l.singer}`}>{t(`editor.singers.${l.singer}`)}</span>}
                  <span className="line-text">{lineText(l)}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>

        <section className="card wide stack roll-panel">
          {line && (
            <>
              <div className="row spread wrap">
                <label className="row small">
                  {t('editor.singer')}
                  <select className="input small" value={line.singer} disabled={readOnly}
                    onChange={(e) => edit(setSinger(chart, lineIndex, e.target.value as Singer))}>
                    {(['P1', 'P2', 'both'] as const).map((s) => <option key={s} value={s}>{t(`editor.singers.${s}`)}</option>)}
                  </select>
                </label>
                {!readOnly && (
                  <span className="row wrap small">
                    {t('editor.moveLine')}
                    <button className="button small" onClick={() => edit(shiftLine(chart, lineIndex, -1))}>←</button>
                    <button className="button small" onClick={() => edit(shiftLine(chart, lineIndex, 1))}>→</button>
                    <button className="button small" onClick={() => edit(joinWithNextLine(chart, lineIndex))}
                      disabled={lineIndex >= chart.lines.length - 1}>{t('editor.joinLine')}</button>
                  </span>
                )}
              </div>

              <PianoRoll
                chart={chart}
                lineIndex={lineIndex}
                selectedNote={noteIndex}
                currentBeat={playing ? currentBeat : null}
                readOnly={readOnly}
                onSelect={setNoteIndex}
                onDragStart={() => setHistory((h) => [...h.slice(-99), chart])}
                onLiveChange={(next, selected) => { setChart(next); setNoteIndex(selected) }}
              />
              {!readOnly && <p className="muted small">{t('editor.help')}</p>}

              <h3>{t('editor.note')}</h3>
              {note && noteIndex != null ? (
                <div className="stack">
                  <div className="form-grid">
                    <label>{t('editor.text')}
                      <input className="input" value={note.text} disabled={readOnly} maxLength={100}
                        onChange={(e) => edit(updateNote(chart, lineIndex, noteIndex, { text: e.target.value }))} />
                      <span className="muted small">{t('editor.textHelp')}</span>
                    </label>
                    <label>{t('editor.kind')}
                      <select className="input" value={note.kind} disabled={readOnly}
                        onChange={(e) => edit(updateNote(chart, lineIndex, noteIndex, { kind: e.target.value as NoteKind }))}>
                        {NOTE_KINDS.map((k) => <option key={k} value={k}>{t(`editor.kinds.${k}`)}</option>)}
                      </select>
                    </label>
                    <label>{t('editor.start')}
                      <input className="input number" type="number" value={note.start} disabled={readOnly} min={0}
                        onChange={(e) => edit(updateNote(chart, lineIndex, noteIndex, { start: Number(e.target.value) }))} />
                    </label>
                    <label>{t('editor.length')}
                      <input className="input number" type="number" value={note.length} disabled={readOnly} min={1}
                        onChange={(e) => edit(updateNote(chart, lineIndex, noteIndex, { length: Number(e.target.value) }))} />
                    </label>
                    <label>{t('editor.pitch')} ({pitchName(note.pitch)})
                      <input className="input number" type="number" value={note.pitch} disabled={readOnly}
                        onChange={(e) => edit(updateNote(chart, lineIndex, noteIndex, { pitch: Number(e.target.value) }))} />
                    </label>
                  </div>
                  {!readOnly && (
                    <div className="row wrap">
                      <button className="button small" onClick={() => edit(splitNote(chart, lineIndex, noteIndex))}>{t('editor.split')}</button>
                      <button className="button small" onClick={() => edit(mergeWithNext(chart, lineIndex, noteIndex))}
                        disabled={noteIndex >= line.notes.length - 1}>{t('editor.mergeNext')}</button>
                      <button className="button small" onClick={() => edit(breakLineAt(chart, lineIndex, noteIndex), { line: lineIndex + 1, note: 0 })}
                        disabled={noteIndex === 0}>{t('editor.breakLine')}</button>
                      <button className="link-button danger small" onClick={() => edit(deleteNote(chart, lineIndex, noteIndex), { note: null })}>
                        {t('editor.deleteNote')}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="muted small">{t('editor.noNote')}</p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
