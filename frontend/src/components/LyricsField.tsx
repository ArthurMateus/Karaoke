import { Check, Clock, Eraser, Search, TextAlignStart } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFindLyrics } from '../api/hooks'
import type { LyricsMatch, LyricsSource } from '../api/types'
import { formatDuration } from '../lib/format'
import { Badge, Button, cx } from '../ui'
import ErrorText from './ErrorText'
import FormStep from './FormStep'

interface Props {
  title: string
  artist: string
  duration: number | null // of the audio file, to pick the matching version
  lyrics: string
  onChange: (lyrics: string, source: LyricsSource) => void
  step?: number // its number when it's one step of a longer form
}

/**
 * Optional lyrics for the converter: look them up online (LRCLIB) or paste them.
 * Known lyrics are fitted to the voice instead of being guessed, which works much
 * better for screamed, fast or heavily processed vocals.
 */
export default function LyricsField({ title, artist, duration, lyrics, onChange, step }: Props) {
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
    <FormStep n={step} title={t('lyrics.heading')} extra={<Badge tone="neutral">{t('lyrics.optional')}</Badge>}>
      <p className="muted small">{t('lyrics.intro')}</p>

      <div className="lyrics-actions">
        <Button icon={Search} onClick={search} disabled={!title.trim()} loading={find.isPending}>
          {find.isPending ? t('lyrics.searching') : t('lyrics.find')}
        </Button>
        {!title.trim() && <span className="muted small">{t('lyrics.needTitle')}</span>}
      </div>
      <ErrorText error={find.error} />

      {matches && matches.length === 0 && <p className="muted small">{t('lyrics.noneFound')}</p>}
      {matches && matches.length > 0 && (
        <ul className="pick-list lyrics-picks" aria-label={t('lyrics.results')}>
          {matches.map((match) => {
            const picked = match.id === chosen
            return (
              <li key={match.id} className={cx('pick', picked && 'selected')}>
                <div className="pick-main">
                  <strong>{match.title}</strong>
                  <span className="muted small">{[match.artist, match.album].filter(Boolean).join(' · ')}</span>
                  {duration && match.duration && Math.abs(match.duration - duration) > 3 && (
                    <span className="muted small">{t('lyrics.otherVersion')}</span>
                  )}
                </div>
                <span className="tags">
                  {match.duration && <span className="tag">{formatDuration(match.duration)}</span>}
                  <Badge tone={match.synced ? 'ok' : 'neutral'} icon={match.synced ? Clock : TextAlignStart}>
                    {match.synced ? t('lyrics.timed') : t('lyrics.plain')}
                  </Badge>
                </span>
                <Button size="sm" variant={picked ? 'secondary' : 'primary'} icon={picked ? Check : undefined} disabled={picked}
                  onClick={() => choose(match)} aria-label={`${picked ? t('lyrics.chosen') : t('lyrics.use')}: ${match.title}`}>
                  {picked ? t('lyrics.chosen') : t('lyrics.use')}
                </Button>
              </li>
            )
          })}
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
        aria-describedby="lyrics-hint"
        onChange={(e) => {
          setChosen(null)
          onChange(e.target.value, e.target.value.trim() ? 'pasted' : '')
        }}
      />
      <div className="lyrics-actions">
        <p className="muted small" id="lyrics-hint">
          {lyrics.trim() ? (timed ? t('lyrics.hintTimed') : t('lyrics.hintPlain')) : t('lyrics.hintEmpty')}
        </p>
        {lyrics.trim() && (
          <Button variant="ghost" size="sm" icon={Eraser} onClick={() => onChange('', '')}>
            {t('lyrics.clear')}
          </Button>
        )}
      </div>
    </FormStep>
  )
}
