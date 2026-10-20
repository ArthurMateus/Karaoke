import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { useRedoLyrics, useSong, useSongLyrics } from '../api/hooks'
import type { LyricsSource } from '../api/types'
import ErrorText from '../components/ErrorText'
import LyricsField from '../components/LyricsField'
import { useConfirm } from '../ui'

/** Give an uploaded song (new) lyrics and rebuild its chart from the saved vocals. */
export default function LyricsPage() {
  const { id = '' } = useParams()
  const song = useSong(id)
  const saved = useSongLyrics(id)

  if (song.isError || saved.isError) return <ErrorText error={song.error ?? saved.error} />
  if (!song.data || !saved.data) return null
  if (!song.data.is_owner || song.data.source !== 'upload' || !song.data.has_vocals_track) {
    return <ErrorText error="no_vocals_track" />
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
    if (!(await confirm({ title: t('lyrics.redoConfirm'), message: t('lyrics.redoWarning'), confirmLabel: t('lyrics.redo'), danger: true }))) return
    redo.mutate({ lyrics, source }, { onSuccess: () => navigate('/songs') })
  }

  return (
    <section className="card stack">
      <h1>{t('lyrics.redoTitle')}</h1>
      <p className="muted">{t('lyrics.redoIntro', { title: props.title })}</p>

      <label htmlFor="search-title">{t('upload.songTitle')}</label>
      <input id="search-title" className="input" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
      <label htmlFor="search-artist">{t('upload.artist')}</label>
      <input id="search-artist" className="input" maxLength={200} value={artist} onChange={(e) => setArtist(e.target.value)} />

      <LyricsField
        title={title}
        artist={artist}
        duration={props.duration}
        lyrics={lyrics}
        onChange={(text, from) => {
          setLyrics(text)
          setSource(from)
        }}
      />

      <p className="banner small">{t('lyrics.redoWarning')}</p>
      <div className="row wrap">
        <button className="button primary" onClick={submit} disabled={props.busy || redo.isPending}>
          {lyrics.trim() ? t('lyrics.redo') : t('lyrics.redoGuess')}
        </button>
        <Link className="button" to="/songs">
          {t('lyrics.cancel')}
        </Link>
      </div>
      {props.busy && <p className="muted small">{t('lyrics.busy')}</p>}
      <ErrorText error={redo.error} />
    </section>
  )
}
