import { ApiError } from './client'
import type { Song } from './types'

/**
 * Sends a form with files and reports upload progress (0..1). fetch() can't
 * report upload progress, so this uses XMLHttpRequest.
 */
export function uploadForm(path: string, form: FormData, onProgress: (fraction: number) => void): Promise<Song> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', path)
    xhr.withCredentials = true
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    }
    xhr.onerror = () => reject(new ApiError(0, 'network'))
    xhr.onload = () => {
      let data: unknown = null
      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        // not JSON
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as Song)
        return
      }
      const code = (data as { detail?: { code?: string } } | null)?.detail?.code
      reject(new ApiError(xhr.status, code ?? (xhr.status === 413 ? 'file_too_large' : 'unknown_error')))
    }
    xhr.send(form)
  })
}
