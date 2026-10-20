import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Song } from '../api/types'
import { ProgressBar, cx } from '../ui'

// The converter's steps, in the order the worker runs them (backend/app/pipeline/jobs.py):
// preparing -> separating -> melody -> lyrics (matching / aligning / transcribing) -> building.
const STEPS = ['preparing', 'separating', 'melody', 'lyrics', 'chart'] as const
type Step = (typeof STEPS)[number]

/** Which of the five steps the API's `progress_step` belongs to (-1 = still waiting in line). */
function stepIndex(progressStep: string): number {
  const map: Record<string, Step> = {
    preparing: 'preparing',
    separating: 'separating',
    melody: 'melody',
    matching: 'lyrics',
    aligning: 'lyrics',
    transcribing: 'lyrics',
    building: 'chart',
  }
  if (progressStep === 'done') return STEPS.length
  const step = map[progressStep]
  return step ? STEPS.indexOf(step) : -1
}

/** A song being converted: five dots (done, now, to do), what's happening now and the overall bar. */
export default function ConversionSteps({ song }: { song: Song }) {
  const { t } = useTranslation()
  const now = stepIndex(song.progress_step)
  const detail = t(`songs.steps.${song.progress_step}`, { defaultValue: song.progress_step })

  // An import only prepares the audio: a plain bar says it all.
  if (song.source === 'import') {
    return (
      <div className="conversion" aria-live="polite">
        <ProgressBar value={song.progress_pct} label={detail} />
      </div>
    )
  }

  return (
    <div className="conversion" aria-live="polite">
      <ol className="conversion-steps" aria-label={t('songs.stepsLabel')}>
        {STEPS.map((step, i) => {
          // Redoing the lyrics reuses the saved voice: separating is already done then.
          const done = i < now || (step === 'separating' && song.has_vocals_track)
          const current = !done && i === now
          const state = done ? t('songs.stepDone') : current ? t('songs.stepNow') : t('songs.stepTodo')
          return (
            <li key={step} className={cx('conversion-step', done && 'done', current && 'current')}>
              <span className="conversion-dot" aria-hidden>
                {done ? <Check size={12} strokeWidth={3.5} /> : i + 1}
              </span>
              <span className="conversion-name">{t(`songs.stepNames.${step}`)}</span>
              <span className="sr-only">: {state}</span>
            </li>
          )
        })}
      </ol>
      <ProgressBar value={song.progress_pct} label={detail} />
    </div>
  )
}
