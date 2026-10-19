import { ApiError } from '../api/client'

const EXTENSIONS: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a' }

/** Send the singer's recording for the group replay. */
export async function uploadTake(
  performanceId: string,
  recording: Blob,
  recordStartServerMs: number,
  micLatencyMs: number,
): Promise<void> {
  const type = recording.type.split(';')[0]
  const form = new FormData()
  form.append('file', recording, `take.${EXTENSIONS[type] ?? 'webm'}`)
  form.append('record_start_ms', String(Math.round(recordStartServerMs)))
  form.append('mic_latency_ms', String(Math.round(micLatencyMs)))
  const response = await fetch(`/api/performances/${performanceId}/takes`, {
    method: 'POST',
    body: form,
    credentials: 'same-origin',
  })
  if (!response.ok) throw new ApiError(response.status, 'upload_failed')
}
