import { Maximize, Minimize } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

/** Fill the TV: the browser's full screen mode, on and off. Hidden where the browser can't do it. */
export default function FullscreenButton() {
  const { t } = useTranslation()
  const [full, setFull] = useState(() => !!document.fullscreenElement)
  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  if (!document.fullscreenEnabled) return null
  const label = full ? t('stage.exitFullscreen') : t('stage.fullscreen')
  return (
    <button type="button" className="stage-control" aria-label={label} title={label}
      onClick={() => void (full ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}>
      {full ? <Minimize size={20} aria-hidden /> : <Maximize size={20} aria-hidden />}
    </button>
  )
}
