export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'RATE_LIMITED'
  | 'PLAN_REQUIRED'
  | 'PLAN_LIMIT_REACHED'
  | 'CONFLICT'
  | 'TIME_EXPIRED'
  | 'AI_NOT_CONFIGURED'
  | 'AI_UNAVAILABLE'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'SERVICE_NOT_CONFIGURED'
  | 'INTERNAL_ERROR'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export type ApiErrorBody = { error: { code: ApiErrorCode; message: string; details?: unknown } }
export type ApiSuccessBody<T> = { data: T }

/** Result type for server actions. */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; code?: ApiErrorCode; fieldErrors?: Record<string, string[]> }

export const notFoundError = (what = 'Resource') => new ApiError(404, 'NOT_FOUND', `${what} not found.`)
export const forbiddenError = (message = 'You do not have access to this resource.') =>
  new ApiError(403, 'FORBIDDEN', message)
