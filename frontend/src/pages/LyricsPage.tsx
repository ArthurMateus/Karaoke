import { ArrowLeft, FileText, RotateCcw, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { useRedoLyrics, useSong, useSongLyrics } from '../api/hooks'
import type { LyricsSource } from '../api/types'
import ErrorText from '../components/ErrorText'
import FormStep from '../components/FormStep'
import LyricsField from '../components/LyricsField'
import { Button, ButtonLink, Card, EmptyState, PageHeader, Skeleton, SongCover, useConfirm } from '../ui'

/** This song can't get new lyrics (not found, or not an upload of yours): say why, with a way back. */
function Unavailable({ error }: { error: unknown }) {
  const { t } = useTranslation()
  return (
    <Card wide>
      <EmptyState
        action={
          <>
            <ErrorText error={error} />
            <ButtonLink variant="primary" icon={ArrowLeft} to="/songs">
              {t('upload.back')}
            </ButtonLink>
          </>
        }
      />
    </Card>
  )
}

/** Give an uploaded song (new) lyrics and rebuild its chart from the saved vocals. */
export default function LyricsPage() {
  const { id = '' } = useParams()
  const song = useSong(id)
  const saved = useSongLyrics(id)

  if (song.isError || saved.isError) return <Unavailable error={song.error ?? saved.error} />
  if (!song.data || !saved.data) {
    return (
      <div className="upload-page" aria-busy="true">
        <Skeleton height={96} radius="var(--r-card)" />
        <Skeleton height={180} radius="var(--r-card)" />
        <Skeleton height={320} radius="var(--r-card)" />
      </div>
    )
  }
  if (!song.data.is_owner || song.data.source !== 'upload' || !song.data.has_vocals_track) {
    return <Unavailable error="no_vocals_track" />
  }
  return <LyricsForm id={id} title={song.data.title} artist={song.data.artist} duration={song.data.duration_seconds}
    busy={song.data.status === 'processing'} initial={saved.data.lyrics} initialSource={saved.data.source} />
}

function LyricsForm(props: {
  id: string
  title: string
  artist: string
  duration: number | null
  busy: boolean
  initial: string
  initialSource: LyricsSource
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const redo = useRedoLyrics(props.id)
  const confirm = useConfirm()
  const [lyrics, setLyrics] = useState(props.initial)
  const [source, setSource] = useState<LyricsSource>(props.initialSource)
  // The song's own title is often a file name ("Band - Song (Official Video)"); let people tidy it for the search.
  const [title, setTitle] = useState(props.title)
  const [artist, setArtist] = useState(props.artist)

  const submit = async () => {
    if (!(await confirm({ title: t('lyrics.redoConfirm'), message: t('lyrics.redoWarning'), confirmLabel: t('lyrics.redoShort'), danger: true }))) return
    redo.mutate({ lyrics, source }, { onSuccess: () => navigate('/songs') })
  }

  return (
    <div className="upload-page lyrics-page">
      <PageHeader
        icon={FileText}
        title={t('lyrics.redoTitle')}
        subtitle={t('lyrics.redoIntro', { title: props.title })}
        actions={
          <ButtonLink variant="ghost" size="sm" icon={ArrowLeft} to="/songs">
            {t('upload.back')}
          </ButtonLink>
        }
      />

      <div className="upload-form">
        <FormStep n={1} title={t('lyrics.searchStep')}>
          <div className="lyrics-song">
            <SongCover song={{ id: props.id, title: props.title }} size={48} />
            <p className="muted small">{t('lyrics.searchStepNote')}</p>
          </div>
          <div className="upload-fields">
            <div>
              <label htmlFor="search-title">{t('upload.songTitle')}</label>
              <input id="search-title" className="input" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label htmlFor="search-artist">{t('upload.artist')}</label>
              <input id="search-artist" className="input" maxLength={200} value={artist} onChange={(e) => setArtist(e.target.value)} />
            </div>
          </div>
        </FormStep>

        <LyricsField
          step={2}
          title={title}
          artist={artist}
          duration={props.duration}
          lyrics={lyrics}
          onChange={(text, from) => {
            setLyrics(text)
            setSource(from)
          }}
        />

        <FormStep n={3} title={t('lyrics.redoStep')}>
          <p className="banner with-icon warn-banner small">
            <TriangleAlert size={16} aria-hidden />
            {t('lyrics.redoWarning')}
          </p>
          <div className="row wrap">
            <Button variant="primary" icon={RotateCcw} onClick={submit} disabled={props.busy} loading={redo.isPending}>
              {lyrics.trim() ? t('lyrics.redo') : t('lyrics.redoGuess')}
            </Button>
            <ButtonLink variant="ghost" to="/songs">
              {t('lyrics.cancel')}
            </ButtonLink>
          </div>
          {props.busy && <p className="muted small">{t('lyrics.busy')}</p>}
          <ErrorText error={redo.error} />
        </FormStep>
      </div>
    </div>
  )
}
