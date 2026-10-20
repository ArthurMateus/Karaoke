import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFindLyrics } from '../api/hooks'
import type { LyricsMatch, LyricsSource } from '../api/types'
import { formatDuration } from '../lib/format'
import ErrorText from './ErrorText'

interface Props {
  title: string
  artist: string
  duration: number | null // of the audio file, to pick the matching version
  lyrics: string
  onChange: (lyrics: string, source: LyricsSource) => void
}

/**
 * Optional lyrics for the converter: look them up online (LRCLIB) or paste them.
 * Known lyrics are fitted to the voice instead of being guessed, which works much
 * better for screamed, fast or heavily processed vocals.
 */
export default function LyricsField({ title, artist, duration, lyrics, onChange }: Props) {
  const { t } = useTranslation()
  const find = useFindLyrics()
  const [chosen, setChosen] = useState<number | null>(null)

  const search = () => {
    setChosen(null)
    find.mutate({ title: title.trim(), artist: artist.trim(), duration })
  }
  const choose = (match: LyricsMatch) => {
    setChosen(match.id)
    onChange(match.lyrics, 'lrclib')
  }
  const matches = find.data
  const timed = /^\s*\[\d{1,3}:\d{1,2}/m.test(lyrics)

  return (
    <fieldset className="stack tight lyrics-field">
      <legend>{t('lyrics.title')}</legend>
      <p className="muted small">{t('lyrics.intro')}</p>

      <div className="row wrap">
        <button type="button" className="button" onClick={search} disabled={!title.trim() || find.isPending}>
          {find.isPending ? t('lyrics.searching') : t('lyrics.find')}
        </button>
        {!title.trim() && <span className="muted small">{t('lyrics.needTitle')}</span>}
      </div>
      <ErrorText error={find.error} />

      {matches && matches.length === 0 && <p className="muted small">{t('lyrics.noneFound')}</p>}
      {matches && matches.length > 0 && (
        <ul className="pick-list">
          {matches.map((match) => (
            <li key={match.id} className={`pick ${match.id === chosen ? 'selected' : ''}`}>
              <div className="pick-main">
                <strong>{match.title}</strong>
                <span className="muted small">
                  {[match.artist, match.album].filter(Boolean).join(' · ')}
                </span>
                {duration && match.duration && Math.abs(match.duration - duration) > 3 && (
                  <span className="muted small">{t('lyrics.otherVersion')}</span>
                )}
              </div>
              <span className="tags">
                {match.duration && <span className="tag">{formatDuration(match.duration)}</span>}
                <span className={`tag ${match.synced ? 'ok' : ''}`}>{match.synced ? t('lyrics.timed') : t('lyrics.plain')}</span>
              </span>
              <button
                type="button"
                className={`button small ${match.id === chosen ? '' : 'primary'}`}
                disabled={match.id === chosen}
                onClick={() => choose(match)}
              >
                {match.id === chosen ? t('lyrics.chosen') : t('lyrics.use')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <label htmlFor="lyrics-text">{t('lyrics.text')}</label>
      <textarea
        id="lyrics-text"
        className="input lyrics-text"
        rows={10}
        spellCheck={false}
        value={lyrics}
        placeholder={t('lyrics.placeholder')}
        onChange={(e) => {
          setChosen(null)
          onChange(e.target.value, e.target.value.trim() ? 'pasted' : '')
        }}
      />
      <p className="muted small">{lyrics.trim() ? (timed ? t('lyrics.hintTimed') : t('lyrics.hintPlain')) : t('lyrics.hintEmpty')}</p>
      {lyrics.trim() && (
        <button type="button" className="link-button small" onClick={() => onChange('', '')}>
          {t('lyrics.clear')}
        </button>
      )}
    </fieldset>
  )
}
