// Mirrors the API response models in backend/app/api/*.py

export type Locale = 'en' | 'pt-BR'

export interface User {
  id: string
  display_name: string
  email: string | null
  is_guest: boolean
  locale: Locale
  is_admin: boolean // may open the Admin page
}

export interface Me {
  user: User | null
}

export interface RoomInfo {
  code: string
  host_name: string
  player_count: number
  capacity: number
  join_url: string
}

export type SongStatus = 'processing' | 'ready' | 'failed'

export interface Song {
  id: string
  title: string
  artist: string
  language: string
  source: 'starter' | 'upload' | 'import'
  status: SongStatus
  progress_step: string
  progress_pct: number
  error_code: string | null
  duration_seconds: number | null
  is_duet: boolean
  is_owner: boolean
  has_vocals_track: boolean
  has_lyrics: boolean // the converter was given the lyrics (found online or pasted)
  created_at: string
}

export type LyricsSource = '' | 'lrclib' | 'pasted'

/** A song's lyrics found online (LRCLIB). `lyrics` is LRC text when `synced`, plain text otherwise. */
export interface LyricsMatch {
  id: number
  title: string
  artist: string
  album: string
  duration: number | null
  synced: boolean
  lyrics: string
}

export interface SongList {
  starter: Song[]
  mine: Song[]
  conversions_left: number | null
  conversions_per_month: number | null
  upload_limits: { max_file_mb: number; max_duration_seconds: number; formats: string[] }
}

/** Singing alone: a run's result. */
export interface SoloResult {
  score: number
  best: number
  new_best: boolean
  daily_rank: number | null
}

/** The song of the day page. */
export interface DailyInfo {
  day: string
  song: { id: string; title: string; artist: string; duration_seconds: number | null } | null
  next_song_at: string
  can_compete: boolean
  // check: the server re-scores top-10 recordings. pending | verified | adjusted | skipped | no_recording
  my_attempt: { score: number | null; rank: number | null; check: string; claimed: number | null } | null
  leaderboard: { rank: number; name: string; score: number; is_me: boolean; check: string }[]
  yesterday: { name: string; score: number; song_title: string } | null
}

/** My plan (Milestone 5). "party" = a running Party Pass: premium rooms for 24 h. */
export interface PlanInfo {
  plan: 'free' | 'premium' | 'party'
  premium_until: string | null
  party_until: string | null
  unused_passes: number
  max_room_size: number
  conversions_per_month: number
  modes: string[]
  replays: boolean
}

export interface AdminGrant {
  id: string
  email: string | null
  name: string
  kind: 'premium' | 'party_pass'
  starts_at: string | null
  ends_at: string | null
  source: string
  note: string
  revoked: boolean
  created_at: string
}

export interface AdminCode {
  id: string
  code: string
  kind: 'premium' | 'party_pass'
  days: number
  max_uses: number
  uses: number
  expires_at: string | null
  disabled: boolean
  note: string
  created_at: string
}
