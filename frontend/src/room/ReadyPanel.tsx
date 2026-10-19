import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { robotMode } from '../audio/devMode'
import { AudioEngine, MicUnavailableError } from '../audio/engine'
import {
  DEFAULT_LATENCY_MS,
  analyzeCalibration,
  beatTimes,
  saveLatency,
  type LevelFrame,
} from '../audio/calibration'
import ErrorText from '../components/ErrorText'
import { wallNow } from '../game/clock'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface Props {
  engine: AudioEngine | null
  onEngine: (engine: AudioEngine) => void
  latency: number | null
  onLatency: (ms: number) => void
  ready: boolean
  onReady: (ready: boolean) => void
}

/** Turn on the mic, measure its delay once, then say "I'm ready". */
export default function ReadyPanel({ engine, onEngine, latency, onLatency, ready, onReady }: Props) {
  const { t } = useTranslation()
  const [step, setStep] = useState<'idle' | 'starting' | 'calibrating' | 'failed'>('idle')
  const [error, setError] = useState<string | null>(null)

  const turnOn = async () => {
    setStep('starting')
    setError(null)
    try {
      onEngine(await AudioEngine.create(robotMode()))
    } catch (err) {
      setError(err instanceof MicUnavailableError ? err.code : 'unknown_error')
    }
    setStep('idle')
  }

  const calibrate = async () => {
    if (!engine) return
    setStep('calibrating')
    const beats = beatTimes(wallNow() + 1200)
    const frames: LevelFrame[] = []
    const stop = engine.onFrame((frame) => frames.push({ t: frame.t, level: frame.level }))
    engine.playClicks(beats)
    await sleep(beats[beats.length - 1] - wallNow() + 700)
    stop()
    const result = analyzeCalibration(frames, beats)
    if (result) {
      saveLatency(result.latencyMs)
      onLatency(result.latencyMs)
      setStep('idle')
    } else {
      setStep('failed')
    }
  }

  const skip = () => {
    saveLatency(DEFAULT_LATENCY_MS)
    onLatency(DEFAULT_LATENCY_MS)
  }

  if (!engine) {
    return (
      <div className="stack">
        <h3>{t('game.mic.title')}</h3>
        <p className="muted small">{t('game.ready.needMic')}</p>
        <button className="button primary" onClick={turnOn} disabled={step === 'starting'}>
          {step === 'starting' ? t('game.mic.turningOn') : t('game.mic.turnOn')}
        </button>
        <ErrorText error={error} />
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="row spread wrap">
        <h3>{t('game.mic.on')}</h3>
        <MicMeter engine={engine} />
      </div>
      {engine.simulated && <p className="banner small">{t('game.mic.robot')}</p>}

      {step === 'calibrating' ? (
        <div className="calibrating" aria-live="polite">
          <strong>{t('game.calibrate.instructions')}</strong>
          <span className="muted small">{t('game.calibrate.listening')}</span>
        </div>
      ) : latency === null || step === 'failed' ? (
        <div className="stack tight">
          <strong>{t('game.calibrate.title')}</strong>
          <p className="muted small">{step === 'failed' ? t('game.calibrate.failed') : t('game.calibrate.intro')}</p>
          <div className="row wrap">
            <button className="button primary" onClick={calibrate}>
              {t('game.calibrate.start')}
            </button>
            <button className="link-button small" onClick={skip}>
              {t('game.calibrate.skip')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="row spread wrap small">
            <span className="muted">{t('game.calibrate.result', { ms: latency })}</span>
            <button className="link-button small" onClick={calibrate}>
              {t('game.calibrate.redo')}
            </button>
          </div>
          <button className={`button ${ready ? '' : 'primary'}`} onClick={() => onReady(!ready)}>
            {ready ? t('game.ready.notReady') : t('game.ready.imReady')}
          </button>
        </>
      )}
    </div>
  )
}

/** A small live level bar, so players can see the mic hears them. */
function MicMeter({ engine }: { engine: AudioEngine }) {
  const { t } = useTranslation()
  const [level, setLevel] = useState(0)
  useEffect(() => {
    let latest = 0
    let frame = 0
    const stop = engine.onFrame((f) => (latest = Math.max(latest * 0.85, f.level)))
    const tick = () => {
      setLevel(latest)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      stop()
      cancelAnimationFrame(frame)
    }
  }, [engine])
  const pct = Math.min(100, Math.round(Math.sqrt(level) * 220))
  return (
    <div className="meter" role="meter" aria-label={t('game.mic.level')} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="meter-bar" style={{ width: `${pct}%` }} />
    </div>
  )
}

