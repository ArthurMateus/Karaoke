// Tiny fetch wrapper. The API answers errors with {detail: {code}}; the UI
// translates the code (see i18n "errors.*"), so error text is never hardcoded.

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const hasBody = options.body !== undefined
  let response: Response
  try {
    response = await fetch(path, {
      method: options.method ?? (hasBody ? 'POST' : 'GET'),
      headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
      body: hasBody ? JSON.stringify(options.body) : undefined,
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, 'network')
  }
  if (!response.ok) {
    throw new ApiError(response.status, await errorCode(response))
  }
  return (await response.json()) as T
}

async function errorCode(response: Response): Promise<string> {
  try {
    const data = await response.json()
    if (typeof data?.detail?.code === 'string') return data.detail.code
  } catch {
    // not JSON
  }
  return response.status === 422 ? 'invalid_input' : 'unknown_error'
}

export function errorCodeOf(error: unknown): string {
  return error instanceof ApiError ? error.code : 'unknown_error'
}
