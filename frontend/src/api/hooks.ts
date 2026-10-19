import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { Locale, Me, RoomInfo, User } from './types'

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
