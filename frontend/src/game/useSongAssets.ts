import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { AudioEngine } from '../audio/engine'
import type { EditorChart } from '../editor/chartModel'
import type { RoomSong } from '../room/protocol'

/**
 * Downloads the room's song as soon as the host picks it, so every phone is
 * ready before the countdown ends. The audio needs the AudioEngine (it decodes
 * with the phone's audio system), so it loads once the mic is turned on.
 */
export function useSongAssets(code: string, song: RoomSong | null, engine: AudioEngine | null) {
  const chart = useQuery({
    queryKey: ['room-chart', code, song?.id],
    queryFn: () => api<EditorChart>(`/api/songs/${song!.id}/chart?room=${code}`),
    enabled: !!song,
    staleTime: Infinity,
    retry: 1,
  })
  const [loaded, setLoaded] = useState<{ id: string; buffer: AudioBuffer } | null>(null)
  const [failedId, setFailedId] = useState<string | null>(null)
  const songId = song?.id

  useEffect(() => {
    if (!engine || !songId) return
    let cancelled = false
    engine
      .loadTrack(`/api/songs/${songId}/audio/instrumental?room=${code}`)
      .then((buffer) => !cancelled && setLoaded({ id: songId, buffer }))
      .catch(() => !cancelled && setFailedId(songId))
    return () => {
      cancelled = true
    }
  }, [engine, songId, code])

  return {
    chart: chart.data,
    buffer: loaded && loaded.id === songId ? loaded.buffer : null,
    failed: chart.isError || (!!songId && failedId === songId),
  }
}
