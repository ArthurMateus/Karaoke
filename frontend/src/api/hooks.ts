import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { EditorChart } from '../editor/chartModel'
import type { DailyInfo, Locale, LyricsMatch, LyricsSource, Me, RoomInfo, Song, SongList, User } from './types'

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/api/me'), staleTime: 60_000 })
}

/** Refresh "who am I" everywhere after signing in, out, or renaming. */
function useSetMe() {
  const queryClient = useQueryClient()
  return (user: User | null) => queryClient.setQueryData<Me>(['me'], { user })
}

export function useRequestMagicLink() {
  return useMutation({
    mutationFn: (body: { email: string; locale: Locale; next?: string }) =>
      api('/api/auth/magic-link', { body }),
  })
}

export function useVerifyMagicLink() {
  const setMe = useSetMe()
  return useMutation({
    mutationFn: (body: { token: string; locale: Locale }) => api<User>('/api/auth/verify', { body }),
    onSuccess: setMe,
  })
}

export function usePlayAsGuest() {
  const setMe = useSetMe()
  return useMutation({
    mutationFn: (body: { display_name: string; locale: Locale }) => api<User>('/api/auth/guest', { body }),
    onSuccess: setMe,
  })
}

export function useUpdateMe() {
  const setMe = useSetMe()
  return useMutation({
    mutationFn: (body: { display_name?: string; locale?: Locale }) =>
      api<User>('/api/me', { method: 'PATCH', body }),
    onSuccess: setMe,
  })
}

export function useSignOut() {
  const setMe = useSetMe()
  return useMutation({
    mutationFn: () => api('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => setMe(null),
  })
}

export function useRoomInfo(code: string) {
  return useQuery({ queryKey: ['room', code], queryFn: () => api<RoomInfo>(`/api/rooms/${code}`), retry: false })
}

export function useCreateRoom() {
  return useMutation({ mutationFn: () => api<RoomInfo>('/api/rooms', { method: 'POST' }) })
}

// --- Songs -------------------------------------------------------------------

const isProcessing = (songs: Song[]) => songs.some((s) => s.status === 'processing')

/** Polls every 2 seconds while a song is being converted. */
export function useSongs() {
  return useQuery({
    queryKey: ['songs'],
    queryFn: () => api<SongList>('/api/songs'),
    refetchInterval: (query) => (query.state.data && isProcessing(query.state.data.mine) ? 2000 : false),
  })
}

export function useSong(id: string) {
  return useQuery({
    queryKey: ['song', id],
    queryFn: () => api<Song>(`/api/songs/${id}`),
    refetchInterval: (query) => (query.state.data?.status === 'processing' ? 2000 : false),
    retry: false,
  })
}

export function useChart(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['chart', id],
    queryFn: () => api<EditorChart>(`/api/songs/${id}/chart`),
    enabled,
    retry: false,
    staleTime: Infinity, // the editor owns the chart once loaded
  })
}

function useRefreshSongs() {
  const queryClient = useQueryClient()
  return (song?: Song) => {
    void queryClient.invalidateQueries({ queryKey: ['songs'] })
    if (song) queryClient.setQueryData(['song', song.id], song)
  }
}

export function useSaveChart(id: string) {
  const refresh = useRefreshSongs()
  return useMutation({
    mutationFn: (chart: EditorChart) => api<Song>(`/api/songs/${id}/chart`, { method: 'PUT', body: chart }),
    onSuccess: refresh,
  })
}

export function useDeleteSong() {
  const refresh = useRefreshSongs()
  return useMutation({
    mutationFn: (id: string) => api(`/api/songs/${id}`, { method: 'DELETE' }),
    onSuccess: () => refresh(),
  })
}

export function useRetrySong() {
  const refresh = useRefreshSongs()
  return useMutation({
    mutationFn: (id: string) => api<Song>(`/api/songs/${id}/retry`, { method: 'POST' }),
    onSuccess: refresh,
  })
}

/** Look a song's lyrics up online. */
export function useFindLyrics() {
  return useMutation({
    mutationFn: ({ title, artist, duration }: { title: string; artist: string; duration: number | null }) => {
      const query = new URLSearchParams({ title, artist })
      if (duration) query.set('duration', String(Math.round(duration)))
      return api<LyricsMatch[]>(`/api/lyrics/search?${query}`)
    },
  })
}

export function useSongLyrics(id: string) {
  return useQuery({
    queryKey: ['song-lyrics', id],
    queryFn: () => api<{ lyrics: string; source: LyricsSource }>(`/api/songs/${id}/lyrics`),
  })
}

/** Rebuild an uploaded song's chart with new lyrics (no new conversion used). */
export function useRedoLyrics(id: string) {
  const refresh = useRefreshSongs()
  return useMutation({
    mutationFn: (body: { lyrics: string; source: LyricsSource }) =>
      api<Song>(`/api/songs/${id}/lyrics`, { body }),
    onSuccess: refresh,
  })
}

export function useDaily() {
  return useQuery({ queryKey: ['daily'], queryFn: () => api<DailyInfo>('/api/daily') })
}

/** Song id -> my best solo score. */
export function useSoloBests(enabled: boolean) {
  return useQuery({ queryKey: ['solo-bests'], queryFn: () => api<Record<string, number>>('/api/solo/bests'), enabled })
}
