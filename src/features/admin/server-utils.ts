import 'server-only'
import { ApiError, type ActionResult } from '@/lib/api/errors'
import { getApiContext, type CurrentProfile } from '@/lib/auth/session'
import { createServerSupabase, SupabaseNotConfiguredError, type Db } from '@/lib/supabase/server'
import type { Role } from '@/config/roles'
import { isExpectedDbError, mapDbError, type DbErrorContext, type DbErrorLike } from './db-errors'

/** Thrown inside admin actions/handlers to surface a mapped database error. */
export class DbActionError extends Error {
  constructor(
    public readonly db: DbErrorLike,
    public readonly ctx: DbErrorContext = {},
  ) {
    super(mapDbError(db, ctx))
    this.name = 'DbActionError'
  }
}

/** Throw a mapped error when a Supabase call failed. */
export function check<T extends { error: DbErrorLike | null }>(res: T, ctx: DbErrorContext = {}): T {
  if (res.error) throw new DbActionError(res.error, ctx)
  return res
}

/** Same mapping for route handlers: DB errors become 4xx ApiErrors with readable messages. */
export function toApiError(err: unknown): unknown {
  if (err instanceof DbActionError) {
    const code = err.db.code
    if (code === '42501') return new ApiError(403, 'FORBIDDEN', err.message)
    if (code === 'P0002' || code === 'PGRST116') return new ApiError(404, 'NOT_FOUND', err.message)
    if (code === '23505') return new ApiError(409, 'CONFLICT', err.message)
    if (isExpectedDbError(err.db)) return new ApiError(422, 'VALIDATION_FAILED', err.message)
    console.error('[admin] unexpected database error', err.db)
    return new ApiError(500, 'INTERNAL_ERROR', err.message)
  }
  return err
}

/**
 * Server-action wrapper: authorizes (getApiContext), provides the user-scoped client and maps
 * every failure to an ActionResult. Never redirects (callers navigate on the client).
 */
export async function adminAction<T>(
  roles: readonly Role[],
  fn: (ctx: { profile: CurrentProfile; db: Db }) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    const { profile } = await getApiContext(roles)
    const db = await createServerSupabase()
    return await fn({ profile, db })
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message, code: err.code }
    if (err instanceof DbActionError) {
      if (!isExpectedDbError(err.db)) console.error('[admin action] database error', err.db)
      return { ok: false, error: err.message }
    }
    if (err instanceof SupabaseNotConfiguredError) {
      return { ok: false, error: 'The database is not configured for this deployment.', code: 'SERVICE_NOT_CONFIGURED' }
    }
    console.error('[admin action] unexpected error', err)
    return { ok: false, error: 'Something went wrong. Try again.', code: 'INTERNAL_ERROR' }
  }
}

/**
 * Reads every row of a query in pages (PostgREST caps responses at 1,000 rows by default).
 * The factory must apply a stable order. Stops at `max` rows and reports truncation honestly.
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: DbErrorLike | null }>,
  opts: { pageSize?: number; max?: number } = {},
): Promise<{ rows: T[]; truncated: boolean }> {
  const pageSize = opts.pageSize ?? 1000
  const max = opts.max ?? 50_000
  const rows: T[] = []
  for (let from = 0; from < max; from += pageSize) {
    const { data, error } = await page(from, Math.min(from + pageSize, max) - 1)
    if (error) throw new DbActionError(error)
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) return { rows, truncated: false }
  }
  return { rows, truncated: true }
}

/** Exact row count of a filtered query (head request). */
export async function countRows(q: PromiseLike<{ count: number | null; error: DbErrorLike | null }>): Promise<number> {
  const { count, error } = await q
  if (error) throw new DbActionError(error)
  return count ?? 0
}

/** Names/emails for audit-style "by" columns. Uses the given client (RLS decides visibility). */
export async function profileNames(db: Db, ids: ReadonlyArray<string | null | undefined>): Promise<Map<string, { name: string; email: string }>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))]
  const out = new Map<string, { name: string; email: string }>()
  if (unique.length === 0) return out
  const { data, error } = await db.from('profiles').select('id, full_name, email').in('id', unique)
  if (error) throw new DbActionError(error)
  for (const p of data ?? []) out.set(p.id, { name: p.full_name || p.email, email: p.email })
  return out
}
