import { describe, expect, it } from 'vitest'
import en from './en.json'
import ptBR from './pt-BR.json'

type Tree = { [key: string]: string | Tree }

function keys(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : keys(value, `${prefix}${key}.`),
  )
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/{{(\w+)}}/g)].map((m) => m[1]).sort()
}

function lookup(tree: Tree, path: string): string {
  return path.split('.').reduce<string | Tree>((node, part) => (node as Tree)[part], tree) as string
}

describe('translations', () => {
  it('English and Portuguese have exactly the same keys', () => {
    expect(keys(ptBR).sort()).toEqual(keys(en).sort())
  })

  it('use the same {{placeholders}} in both languages', () => {
    for (const key of keys(en)) {
      expect(placeholders(lookup(ptBR, key)), key).toEqual(placeholders(lookup(en, key)))
    }
  })

  it('have no empty texts', () => {
    for (const key of keys(en)) {
      expect(lookup(en, key).trim(), key).not.toBe('')
      expect(lookup(ptBR, key).trim(), key).not.toBe('')
    }
  })

  it('cover every error code the backend sends', () => {
    const backendCodes = [
      'not_signed_in', 'account_required', 'room_not_found', 'too_many_links',
      'invalid_or_expired_link', 'invalid_name', 'not_allowed',
      // songs API
      'song_not_found', 'file_too_large', 'unsupported_format', 'too_short', 'too_long', 'rights_required',
      'conversion_limit_reached', 'song_not_ready', 'not_failed', 'track_not_found',
      // "chart_" + ChartError codes from backend/app/charts
      'chart_missing_bpm', 'chart_invalid_header', 'chart_no_notes', 'chart_invalid_note', 'chart_unsupported_part',
      'chart_invalid_bpm', 'chart_empty_line', 'chart_invalid_note_timing', 'chart_invalid_pitch', 'chart_overlapping_notes',
      // conversion worker (backend/app/pipeline/jobs.py)
      'audio_decode_failed', 'separation_failed', 'transcription_failed', 'no_lyrics_found', 'melody_failed',
      'chart_failed', 'upload_failed', 'internal_error',
      // Sing Together (backend/app/ws/game.py, app/api/performances.py) and the mic
      'no_song_selected', 'nobody_ready', 'wrong_phase', 'performance_not_found', 'replay_not_ready',
      'empty_recording', 'mic_denied', 'mic_missing', 'mic_unsupported',
    ]
    for (const code of backendCodes) expect(Object.keys(en.errors)).toContain(code)
  })
})
