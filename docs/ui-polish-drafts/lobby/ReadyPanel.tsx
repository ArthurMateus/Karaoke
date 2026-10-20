import { Check, Info, Mic, RotateCcw, Timer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
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
import { Badge, Button, cx } from '../ui'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface Props {
  engine: AudioEngine | null
  onEngine: (engine: AudioEngine) => void
  latency: number | null
  onLatency: (ms: number) => void
  ready: boolean
  onReady: (ready: boolean) => void
  readyLabel?: string // e.g. "Start singing" when singing alone
  readyInBar?: boolean // on phones the ready button lives in the bottom bar instead
}

/** Turn on the mic, measure its delay once, then say "I'm ready": three steps. */
export default function ReadyPanel({ engine, onEngine, latency, onLatency, ready, onReady, readyLabel, readyInBar }: Props) {
  const { t } = useTranslation()
  const [step, setStep] = useState<'idle' | 'starting' | 'calibrating' | 'failed'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [beats, setBeats] = useState<number[]>([])

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
    setBeats(beats)
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

  const checked = latency !== null && step !== 'failed'
  const current = !engine ? 0 : !checked ? 1 : 2

  return (
    <div className="mic-panel">
      <div className="mic-head">
        <span className="card-icon" aria-hidden>
          <Mic size={18} />
        </span>
        <h2>{engine ? t('game.mic.on') : t('game.mic.title')}</h2>
        {engine && <MicMeter engine={engine} />}
      </div>

      <ol className="mic-steps" aria-label={t('game.steps.label')}>
        {(['mic', 'check', 'ready'] as const).map((name, i) => {
          const done = i < current || (i === 2 && ready)
          return (
            <li key={name} className={cx(done && 'done', i === current && !done && 'current')} aria-current={i === current && !done ? 'step' : undefined}>
              <span className="mic-step-dot" aria-hidden>
                {done ? <Check size={13} strokeWidth={3} /> : i + 1}
              </span>
              <span>{t(`game.steps.${name}`)}</span>
            </li>
          )
        })}
      </ol>

      {engine?.simulated && <p className="banner small">{t('game.mic.robot')}</p>}

      {!engine ? (
        <div className="stack tight">
          <p className="muted small">{t('game.ready.needMic')}</p>
          <Button variant="primary" icon={Mic} loading={step === 'starting'} onClick={turnOn} id="mic-turn-on">
            {step === 'starting' ? t('game.mic.turningOn') : t('game.mic.turnOn')}
          </Button>
          <ErrorText error={error} />
        </div>
      ) : step === 'calibrating' ? (
        <div className="calibrating" aria-live="polite">
          <BeatDots beats={beats} />
          <strong>{t('game.calibrate.instructions')}</strong>
          <span className="small">{t('game.calibrate.listening')}</span>
        </div>
      ) : !checked ? (
        <div className="stack tight">
          <strong>{t('game.calibrate.title')}</strong>
          <p className="muted small">{step === 'failed' ? t('game.calibrate.failed') : t('game.calibrate.intro')}</p>
          <div className="row wrap">
            <Button variant="primary" icon={Timer} onClick={calibrate}>
              {t('game.calibrate.start')}
            </Button>
            <Button variant="ghost" size="sm" onClick={skip}>
              {t('game.calibrate.skip')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="mic-result">
            <span className="small">{t('game.calibrate.result', { ms: latency })}</span>
            <Button variant="ghost" size="sm" icon={RotateCcw} onClick={calibrate}>
              {t('game.calibrate.redo')}
            </Button>
          </div>
          <div className={cx('mic-ready', readyInBar && 'hide-on-phone')}>
            {ready && (
              <Badge tone="ok" icon={Check}>
                {t('lobby.ready')}
              </Badge>
            )}
            <Button variant={ready ? 'secondary' : 'primary'} block={!ready} onClick={() => onReady(!ready)}>
              {ready ? t('game.ready.notReady') : (readyLabel ?? t('game.ready.imReady'))}
            </Button>
          </div>
          {readyInBar && ready && (
            <p className="show-on-phone small ok-text">
              <Check size={14} aria-hidden /> {t('lobby.ready')}
            </p>
          )}
        </>
      )}

      <p className="mic-note small">
        <Info size={14} aria-hidden />
        <span>
          {t('game.mic.recorded')} <Link to="/privacy">{t('footer.privacy')}</Link>
        </span>
      </p>
    </div>
  )
}

/** Eight dots, one per click of the delay check; each lights up when its click plays. */
function BeatDots({ beats }: { beats: number[] }) {
  const [heard, setHeard] = useState(0)
  useEffect(() => {
    let frame = 0
    const tick = () => {
      const now = wallNow()
      setHeard(beats.filter((b) => b <= now).length)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [beats])
  return (
    <span className="beat-dots" aria-hidden>
      {beats.map((b, i) => (
        <span key={b} className={cx('beat-dot', i < heard && 'played', i === heard - 1 && 'now')} />
      ))}
    </span>
  )
}

const BARS = 14

/** A live level meter (14 bars), so players can see the mic hears them. */
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
  const lit = Math.round((pct / 100) * BARS)
  return (
    <div className="meter" role="meter" aria-label={t('game.mic.level')} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      {Array.from({ length: BARS }, (_, i) => (
        <span key={i} className={cx('meter-cell', i < lit && 'on', i >= BARS - 3 && 'hot', i >= BARS - 6 && i < BARS - 3 && 'warm')} />
      ))}
    </div>
  )
}
