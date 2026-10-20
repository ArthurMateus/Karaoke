import { ArrowLeft, CloudUpload, FileMusic, FileText, Music, TriangleAlert, Upload } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate } from 'react-router'
import { useMe, useSongs } from '../api/hooks'
import type { LyricsSource } from '../api/types'
import { uploadForm } from '../api/upload'
import ErrorText from '../components/ErrorText'
import FileDrop from '../components/FileDrop'
import FormStep from '../components/FormStep'
import LyricsField from '../components/LyricsField'
import { formatSize } from '../lib/files'
import { formatDuration } from '../lib/format'
import { Button, ButtonLink, PageHeader, ProgressBar, Skeleton } from '../ui'

/** Upload your own audio to convert (mode "upload"), or import an UltraStar chart (mode "import"). */
export default function UploadPage({ mode }: { mode: 'upload' | 'import' }) {
  const { t, i18n } = useTranslation()
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
  const [lyrics, setLyrics] = useState('')
  const [lyricsSource, setLyricsSource] = useState<LyricsSource>('')
  const duration = useFileDuration(audio)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<unknown>(null)

  if (me.isPending || !songs.data) return <UploadSkeleton />
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
      if (lyrics.trim()) {
        form.append('lyrics', lyrics)
        form.append('lyrics_source', lyricsSource)
      }
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
  // Hints only: the server checks the real limits.
  const tooBig = !!audio && audio.size > limits.max_file_mb * 1024 * 1024
  const tooLong = duration != null && duration > limits.max_duration_seconds
  const audioDetails = audio && (
    <>
      <span className={tooBig ? 'tag warn' : 'tag'}>{formatSize(audio.size, i18n.language)}</span>
      {duration != null && <span className={tooLong ? 'tag warn' : 'tag'}>{formatDuration(duration)}</span>}
      {(tooBig || tooLong) && (
        <span className="tag warn">
          <TriangleAlert size={12} aria-hidden /> {t('upload.overLimit')}
        </span>
      )}
    </>
  )
  const audioDrop = (
    <FileDrop id="audio-file" required icon={Music} file={audio} onFile={setAudio} details={audioDetails} hint={fileHelp}
      title={mode === 'upload' ? t('upload.file') : t('import.audio')}
      accept={limits.formats.map((f) => `.${f}`).join(',') + ',audio/*'} />
  )
  const fileName = audio?.name.replace(/\.[^.]+$/, '') ?? ''
  let n = 0 // step numbers

  return (
    <div className="upload-page">
      <PageHeader
        icon={mode === 'upload' ? CloudUpload : FileMusic}
        title={mode === 'upload' ? t('upload.title') : t('import.title')}
        subtitle={mode === 'upload' ? t('upload.intro') : t('import.intro')}
        actions={
          <ButtonLink variant="ghost" size="sm" icon={ArrowLeft} to="/songs">
            {t('upload.back')}
          </ButtonLink>
        }
      />
      {noneLeft && (
        <p className="banner with-icon error-banner" role="alert">
          <TriangleAlert size={18} aria-hidden />
          {t('upload.noConversionsLeft', { total: conversions_per_month })}
        </p>
      )}

      <form className="upload-form" onSubmit={submit}>
        {mode === 'import' ? (
          <>
            <FormStep n={++n} title={t('import.chartStep')}>
              <FileDrop id="chart-file" required icon={FileText} file={chart} onFile={setChart} accept=".txt,text/plain"
                title={t('import.chart')} hint={t('import.chartHint')}
                details={chart && <span className="tag">{formatSize(chart.size, i18n.language)}</span>} />
            </FormStep>
            <FormStep n={++n} title={t('import.audioStep')}>{audioDrop}</FormStep>
          </>
        ) : (
          <>
            <FormStep n={++n} title={t('upload.fileStep')}>{audioDrop}</FormStep>
            <FormStep n={++n} title={t('upload.aboutStep')}>
              <div className="upload-fields">
                <div className="full">
                  <label htmlFor="song-title">{t('upload.songTitle')}</label>
                  <input id="song-title" className="input" maxLength={200} value={title}
                    placeholder={fileName} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="song-artist">{t('upload.artist')}</label>
                  <input id="song-artist" className="input" maxLength={200} value={artist} onChange={(e) => setArtist(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="song-language">{t('upload.language')}</label>
                  <select id="song-language" className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
                    {(['auto', 'en', 'pt'] as const).map((code) => (
                      <option key={code} value={code}>
                        {t(`upload.languages.${code}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </FormStep>
            <LyricsField
              step={++n}
              title={title || fileName}
              artist={artist}
              duration={duration}
              lyrics={lyrics}
              onChange={(text, source) => {
                setLyrics(text)
                setLyricsSource(source)
              }}
            />
          </>
        )}

        <FormStep n={++n} title={t('upload.confirmStep')}>
          <label className="checkbox">
            <input type="checkbox" checked={rights} required onChange={(e) => setRights(e.target.checked)} />
            <span>{t('upload.rights')}</span>
          </label>
          <p className="muted small">{t('upload.rightsNote')}</p>
          <div className="upload-submit">
            {progress != null && <ProgressBar value={progress * 100} label={t('upload.uploading', { pct: Math.round(progress * 100) })} detail="" />}
            <Button variant="primary" size="lg" type="submit" icon={Upload} loading={progress != null} disabled={noneLeft || !rights}>
              {progress != null
                ? t('upload.uploading', { pct: Math.round(progress * 100) })
                : mode === 'upload'
                  ? t('upload.submit')
                  : t('import.submit')}
            </Button>
            {!rights && progress == null && <p className="muted small">{t('upload.needRights')}</p>}
          </div>
          <ErrorText error={error} />
        </FormStep>
      </form>
    </div>
  )
}

function UploadSkeleton() {
  return (
    <div className="upload-page" aria-busy="true">
      <div className="page-header">
        <Skeleton width={48} height={48} radius={14} />
        <div className="page-titles">
          <Skeleton width={220} height={32} />
          <Skeleton width="90%" height={18} />
        </div>
      </div>
      <Skeleton height={230} radius="var(--r-card)" />
      <Skeleton height={200} radius="var(--r-card)" />
    </div>
  )
}

/** The length of a chosen audio file in seconds, read by the browser (null until known). */
function useFileDuration(file: File | null): number | null {
  const [duration, setDuration] = useState<{ file: File; seconds: number } | null>(null)
  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    const probe = new Audio()
    probe.preload = 'metadata'
    probe.onloadedmetadata = () => Number.isFinite(probe.duration) && setDuration({ file, seconds: probe.duration })
    probe.src = url
    return () => {
      probe.removeAttribute('src')
      URL.revokeObjectURL(url)
    }
  }, [file])
  return duration && duration.file === file ? duration.seconds : null
}
