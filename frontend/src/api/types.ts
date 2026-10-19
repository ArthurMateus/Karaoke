// Mirrors the API response models in backend/app/api/*.py

export type Locale = 'en' | 'pt-BR'

export interface User {
  id: string
  display_name: string
  email: string | null
  is_guest: boolean
  locale: Locale
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
