import { useEffect, useRef } from 'react'
import { foldToTarget, type Scorer } from '../game/scoring'
import type { Timeline } from '../game/timeline'

export interface TrailPoint {
  time: number // song time, seconds
  midi: number | null
}

interface Props {
  timeline: Timeline
  songTime: () => number // current song time, read every frame
  scorer: Scorer | null // null for watchers: no hit colouring
  trail: TrailPoint[] | null // the singer's recent pitch
}

const PAST_SECONDS = 1.3
const FUTURE_SECONDS = 3.7

function cssColor(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

/** The stage: notes scroll toward the "now" line; the singer's pitch is traced over them. */
export default function NoteLane({ timeline, songTime, scorer, trail }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const ctx = el.getContext('2d')
    if (!ctx) return
    const colors = {
      stage: cssColor('--stage', '#15131a'),
      line: cssColor('--stage-line', '#2c2836'),
      note: cssColor('--stage-note', '#3d3850'),
      hit: cssColor('--violet', '#5b3df5'),
      gold: cssColor('--amber', '#e0951a'),
      trace: cssColor('--coral', '#ff6b4a'),
      text: cssColor('--stage-text', '#f3f1fa'),
    }
    let frame = 0
    let low = 55
    let high = 72 // pitch range shown, eased toward the current line's notes

    const draw = () => {
      const dpr = window.devicePixelRatio || 1
      const width = el.clientWidth
      const height = el.clientHeight
      if (el.width !== Math.round(width * dpr) || el.height !== Math.round(height * dpr)) {
        el.width = Math.round(width * dpr)
        el.height = Math.round(height * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const now = songTime()
      const nowX = width * (PAST_SECONDS / (PAST_SECONDS + FUTURE_SECONDS))
      const pps = width / (PAST_SECONDS + FUTURE_SECONDS)
      const x = (t: number) => nowX + (t - now) * pps

      // Keep the visible notes in frame.
      const visible = timeline.notes.filter((n) => n.end > now - PAST_SECONDS && n.start < now + FUTURE_SECONDS)
      if (visible.length) {
        const targetLow = Math.min(...visible.map((n) => n.midi)) - 3
        const targetHigh = Math.max(Math.max(...visible.map((n) => n.midi)) + 3, targetLow + 12)
        low += (targetLow - low) * 0.08
        high += (targetHigh - high) * 0.08
      }
      const rowHeight = height / (high - low)
      const y = (midi: number) => height - (midi - low) * rowHeight

      ctx.fillStyle = colors.stage
      ctx.fillRect(0, 0, width, height)
      ctx.strokeStyle = colors.line
      ctx.lineWidth = 1
      for (let m = Math.ceil(low); m < high; m += 2) {
        ctx.beginPath()
        ctx.moveTo(0, Math.round(y(m)) + 0.5)
        ctx.lineTo(width, Math.round(y(m)) + 0.5)
        ctx.stroke()
      }

      const barHeight = Math.max(8, Math.min(18, rowHeight * 0.9))
      for (const note of visible) {
        if (note.kind === 'freestyle') continue
        const left = x(note.start)
        const w = Math.max(4, (note.end - note.start) * pps - 2)
        const top = y(note.midi) - barHeight / 2
        ctx.fillStyle = colors.note
        roundRect(ctx, left, top, w, barHeight)
        ctx.fill()
        if (scorer) {
          // Fill the part that was sung on pitch.
          const index = timeline.notes.indexOf(note)
          const fraction = scorer.noteFraction(index)
          if (fraction > 0) {
            ctx.fillStyle = colors.hit
            roundRect(ctx, left, top, Math.max(4, w * fraction), barHeight)
            ctx.fill()
          }
        }
        if (note.kind === 'golden' || note.kind === 'rap_golden') {
          ctx.strokeStyle = colors.gold
          ctx.lineWidth = 2
          roundRect(ctx, left, top, w, barHeight)
          ctx.stroke()
        }
      }

      // The singer's pitch, folded to the octave of the notes nearby.
      if (trail && trail.length > 1) {
        ctx.strokeStyle = colors.trace
        ctx.lineWidth = 3
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        let drawing = false
        for (const point of trail) {
          if (point.time < now - PAST_SECONDS || point.midi === null) {
            drawing = false
            continue
          }
          const near = timeline.notes.find((n) => n.end > point.time - 0.3) ?? timeline.notes[timeline.notes.length - 1]
          const midi = near ? foldToTarget(point.midi, near.midi) : point.midi
          const px = x(point.time)
          const py = y(midi)
          if (drawing) ctx.lineTo(px, py)
          else ctx.moveTo(px, py)
          drawing = true
        }
        ctx.stroke()
      }

      ctx.strokeStyle = colors.trace
      ctx.globalAlpha = 0.45
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(nowX, 0)
      ctx.lineTo(nowX, height)
      ctx.stroke()
      ctx.globalAlpha = 1

      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [timeline, songTime, scorer, trail])

  return <canvas ref={canvas} className="note-lane" aria-hidden="true" />
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const r = Math.min(h / 2, w / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
