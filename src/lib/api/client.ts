import type { ApiErrorCode } from './errors'

/** Error thrown by apiFetch on non-2xx responses. Safe to show `message` to users. */
export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode | 'NETWORK_ERROR',
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

/** Typed fetch for our JSON API envelope (`{ data }` / `{ error }`). Browser or server. */
export async function apiFetch<T>(
  path: string,
  init: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
      credentials: 'same-origin',
      cache: 'no-store',
    })
  } catch {
    throw new ApiClientError(0, 'NETWORK_ERROR', 'Network error. Check your connection and try again.')
  }
  let payload: { data?: T; error?: { code: ApiErrorCode; message: string; details?: unknown } } = {}
  try {
    payload = await res.json()
  } catch {
    // non-JSON body
  }
  if (!res.ok || payload.error) {
    throw new ApiClientError(
      res.status,
      payload.error?.code ?? 'INTERNAL_ERROR',
      payload.error?.message ?? 'Something went wrong. Please try again.',
      payload.error?.details,
    )
  }
  return payload.data as T
}
