import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate } from 'react-router'
import { useMe, useSongs } from '../api/hooks'
import { uploadForm } from '../api/upload'
import ErrorText from '../components/ErrorText'

/** Upload your own audio to convert (mode "upload"), or import an UltraStar chart (mode "import"). */
export default function UploadPage({ mode }: { mode: 'upload' | 'import' }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const me = useMe()
  const songs = useSongs()
  const [audio, setAudio] = useState<File | null>(null)
  const [chart, setChart] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [language, setLanguage] = useState('auto')
  const [rights, setRights] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<unknown>(null)

  if (me.isPending || !songs.data) return null
  const user = me.data?.user
  if (!user || user.is_guest) return <Navigate to={`/sign-in?next=/songs/${mode}`} replace />

  const { upload_limits: limits, conversions_left, conversions_per_month } = songs.data
  const noneLeft = mode === 'upload' && conversions_left === 0

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!audio || (mode === 'import' && !chart)) return
    const form = new FormData()
    form.append('file', audio)
    form.append('rights_confirmed', String(rights))
    if (mode === 'upload') {
      form.append('title', title)
      form.append('artist', artist)
      form.append('language', language)
    } else {
      form.append('chart', chart!)
    }
    setError(null)
    setProgress(0)
    try {
      await uploadForm(`/api/songs/${mode}`, form, setProgress)
      await queryClient.invalidateQueries({ queryKey: ['songs'] })
      navigate('/songs')
    } catch (err) {
      setError(err)
      setProgress(null)
    }
  }

  const fileHelp = t('upload.fileHelp', {
    formats: limits.formats.map((f) => f.toUpperCase()).join(', '),
    mb: limits.max_file_mb,
    minutes: Math.round(limits.max_duration_seconds / 60),
  })

  return (
    <section className="card stack">
      <h1>{mode === 'upload' ? t('upload.title') : t('import.title')}</h1>
      <p className="muted">{mode === 'upload' ? t('upload.intro') : t('import.intro')}</p>
      {noneLeft && <p className="error">{t('upload.noConversionsLeft', { total: conversions_per_month })}</p>}

      <form className="stack" onSubmit={submit}>
        {mode === 'import' && (
          <>
            <label htmlFor="chart-file">{t('import.chart')}</label>
            <input id="chart-file" className="input" type="file" accept=".txt,text/plain" required
              onChange={(e) => setChart(e.target.files?.[0] ?? null)} />
          </>
        )}

        <label htmlFor="audio-file">{mode === 'upload' ? t('upload.file') : t('import.audio')}</label>
        <input id="audio-file" className="input" type="file" required
          accept={limits.formats.map((f) => `.${f}`).join(',') + ',audio/*'}
          onChange={(e) => setAudio(e.target.files?.[0] ?? null)} />
        <p className="muted small">{fileHelp}</p>

        {mode === 'upload' && (
          <>
            <label htmlFor="song-title">{t('upload.songTitle')}</label>
            <input id="song-title" className="input" maxLength={200} value={title}
              placeholder={audio?.name.replace(/\.[^.]+$/, '')} onChange={(e) => setTitle(e.target.value)} />
            <label htmlFor="song-artist">{t('upload.artist')}</label>
            <input id="song-artist" className="input" maxLength={200} value={artist} onChange={(e) => setArtist(e.target.value)} />
            <label htmlFor="song-language">{t('upload.language')}</label>
            <select id="song-language" className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {(['auto', 'en', 'pt'] as const).map((code) => (
                <option key={code} value={code}>
                  {t(`upload.languages.${code}`)}
                </option>
              ))}
            </select>
          </>
        )}

        <label className="checkbox">
          <input type="checkbox" checked={rights} required onChange={(e) => setRights(e.target.checked)} />
          <span>{t('upload.rights')}</span>
        </label>
        <p className="muted small">{t('upload.rightsNote')}</p>

        {progress != null && (
          <div className="progress" aria-label={t('upload.uploading', { pct: Math.round(progress * 100) })}>
            <div className="progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
        <button className="button primary" type="submit" disabled={progress != null || noneLeft || !rights}>
          {progress != null
            ? t('upload.uploading', { pct: Math.round(progress * 100) })
            : mode === 'upload'
              ? t('upload.submit')
              : t('import.submit')}
        </button>
      </form>
      <ErrorText error={error} />
    </section>
  )
}
