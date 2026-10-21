import { Headphones } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AudioEngine } from '../audio/engine'
import { Monitor } from '../audio/monitor'
import type { EditorChart, Singer } from '../editor/chartModel'
import { lyricLines, lyricPosition, type LyricLine } from '../game/lyricLines'
import { MONITOR_EFFECTS, readMonitor, writeMonitor, type MonitorPrefs, type SingViewMode } from '../game/singPrefs'
import type { Part } from '../game/timeline'

/** Simple (lyrics only) or Advanced (note lane + lyrics). */
export function ViewToggle({ view, onView }: { view: SingViewMode; onView: (view: SingViewMode) => void }) {
  const { t } = useTranslation()
  return (
    <div className="sing-segmented" role="group" aria-label={t('game.sing.view.label')}>
      {(['simple', 'advanced'] as const).map((mode) => (
        <button key={mode} type="button" aria-pressed={view === mode} onClick={() => onView(mode)}>
          {t(`game.sing.view.${mode}`)}
        </button>
      ))}
    </div>
  )
}

/**
 * "Hear myself": a switch, and when it is on, the level and effect controls.
 * Owns the monitor branch of the audio graph while the singer is singing.
 */
export function MonitorControls({ engine }: { engine: AudioEngine }) {
  const { t } = useTranslation()
  const [prefs, setPrefs] = useState<MonitorPrefs>(readMonitor)
  const monitor = useRef<Monitor | null>(null)
  const update = (patch: Partial<MonitorPrefs>) =>
    setPrefs((p) => {
      const next = { ...p, ...patch }
      writeMonitor(next)
      return next
    })

  useEffect(() => {
    const node = prefs.on ? engine.micSource : null
    if (!node) return
    const m = new Monitor(engine.ctx, node)
    monitor.current = m
    return () => {
      m.close()
      monitor.current = null
    }
  }, [engine, prefs.on])
  // Runs after the effect above, so a new monitor gets the settings straight away.
  useEffect(() => {
    monitor.current?.set(prefs)
  }, [prefs])

  return (
    <div className="monitor">
      <div className="monitor-head">
        <button type="button" className="sing-switch monitor-switch" aria-pressed={prefs.on} onClick={() => update({ on: !prefs.on })}>
          <Headphones size={16} aria-hidden />
          {t('game.sing.monitor.switch')}
          <span className="switch-state">{prefs.on ? t('game.sing.monitor.on') : t('game.sing.monitor.off')}</span>
        </button>
        <span className="small monitor-hint">{t('game.sing.monitor.hint')}</span>
      </div>
      {prefs.on && (
        <div className="monitor-panel">
          <label className="monitor-slider">
            <span>{t('game.sing.monitor.level')}</span>
            <input type="range" min={0} max={1} step={0.05} value={prefs.level} onChange={(e) => update({ level: Number(e.target.value) })} />
          </label>
          <div className="sing-segmented small-seg" role="group" aria-label={t('game.sing.monitor.effect')}>
            {MONITOR_EFFECTS.map((effect) => (
              <button key={effect} type="button" aria-pressed={prefs.effect === effect} title={t(`game.sing.monitor.effects.${effect}Long`)}
                onClick={() => update({ effect })}>
                {t(`game.sing.monitor.effects.${effect}`)}
              </button>
            ))}
          </div>
          {prefs.effect !== 'off' && (
            <label className="monitor-slider">
              <span>{t('game.sing.monitor.wet')}</span>
              <input type="range" min={0} max={1} step={0.05} value={prefs.wet} onChange={(e) => update({ wet: Number(e.target.value) })} />
            </label>
          )}
        </div>
      )}
    </div>
  )
}

const lineText = (line: LyricLine | undefined) => (line ? line.words.map((w) => (w.text === '~' ? '' : w.text)).join('').trim() : '')

/**
 * The Simple view: the current line big, its words lighting up as they are due, the next
 * line smaller. Keeps its own state, so only this block re-renders, once per word.
 */
export function SimpleLyrics(props: { chart: EditorChart; part: Part | null; songTime: () => number; duet: boolean; partLabel: (singer: Singer) => string }) {
  const { chart, part, songTime, duet, partLabel } = props
  const lines = useMemo(() => lyricLines(chart, part), [chart, part])
  const [pos, setPos] = useState({ line: 0, sung: 0 })
  useEffect(() => {
    let frame = 0
    const tick = () => {
      const next = lyricPosition(lines, songTime())
      setPos((p) => (p.line === next.line && p.sung === next.sung ? p : next))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [lines, songTime])

  const current = lines[pos.line]
  const next = lines[pos.line + 1]
  return (
    <div className={`simple-lyrics part-${current?.singer ?? 'P1'}`} aria-live="off">
      <div key={pos.line} className="simple-current">
        {duet && current && <span className={`simple-part part-${current.singer}`}>{partLabel(current.singer)}</span>}
        <p className="simple-line">
          {current?.words.map((word, i) =>
            word.text === '~' ? null : (
              <span key={i} className={wordClass(word.kind, i < pos.sung)}>
                {word.text}
              </span>
            ),
          )}
        </p>
      </div>
      <p className="simple-next">
        {duet && next && <span className={`simple-dot part-${next.singer}`} title={partLabel(next.singer)} aria-hidden />}
        {lineText(next)}
      </p>
    </div>
  )
}

function wordClass(kind: string, sung: boolean): string | undefined {
  const names = [sung && 'sung', (kind === 'rap' || kind === 'rap_golden') && 'rap', (kind === 'golden' || kind === 'rap_golden') && 'golden']
  return names.filter(Boolean).join(' ') || undefined
}
