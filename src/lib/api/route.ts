import 'server-only'
import { NextResponse } from 'next/server'
import { z, type ZodType } from 'zod'
import type { User } from '@supabase/supabase-js'
import { ApiError, type ApiErrorBody } from './errors'
import { getApiContext, type CurrentProfile } from '@/lib/auth/session'
import { createServerSupabase, SupabaseNotConfiguredError, type Db } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { clientIp, enforceRateLimit, type RateLimitRule } from '@/lib/security/rate-limit'
import type { Role } from '@/config/roles'

type AuthMode = 'public' | 'user' | readonly Role[]

type Ctx<TBody, TQuery, TAuth extends AuthMode> = {
  request: Request
  params: Record<string, string>
  body: TBody
  query: TQuery
  /** User-scoped Supabase client (RLS). */
  db: Db
  /** Service-role client — only after authorization. Lazily created. */
  admin: () => Db
  requestId: string
} & (TAuth extends 'public'
  ? { user: User | null; profile: CurrentProfile | null }
  : { user: User; profile: CurrentProfile })

type RouteOptions<TBodySchema extends ZodType | undefined, TQuerySchema extends ZodType | undefined, TAuth extends AuthMode> = {
  auth?: TAuth
  body?: TBodySchema
  query?: TQuerySchema
  rateLimit?: RateLimitRule
  handler: (
    ctx: Ctx<
      TBodySchema extends ZodType ? z.infer<TBodySchema> : undefined,
      TQuerySchema extends ZodType ? z.infer<TQuerySchema> : undefined,
      TAuth
    >,
  ) => Promise<unknown>
}

function zodDetails(error: z.ZodError) {
  return z.flattenError(error).fieldErrors
}

export function errorResponse(err: unknown, requestId: string): NextResponse<ApiErrorBody> {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) } },
      { status: err.status },
    )
  }
  if (err instanceof SupabaseNotConfiguredError) {
    return NextResponse.json(
      { error: { code: 'SERVICE_NOT_CONFIGURED', message: 'The database is not configured for this deployment.' } },
      { status: 503 },
    )
  }
  console.error(`[api] ${requestId} unhandled error`, err)
  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message: `Something went wrong on our side (ref ${requestId}).` } },
    { status: 500 },
  )
}

/**
 * Route handler wrapper: authentication, Zod validation, rate limiting, uniform JSON envelopes.
 *
 *   export const POST = route({ auth: 'user', body: Schema, handler: async ({ body, profile }) => ({ ok: true }) })
 *
 * Return a plain value → 200 `{ data }`. Return a `Response` to take full control.
 */
export function route<
  TBodySchema extends ZodType | undefined = undefined,
  TQuerySchema extends ZodType | undefined = undefined,
  TAuth extends AuthMode = 'user',
>(options: RouteOptions<TBodySchema, TQuerySchema, TAuth>) {
  return async (request: Request, context: { params: Promise<Record<string, string | string[]>> }) => {
    const requestId = crypto.randomUUID().slice(0, 8)
    try {
      const auth: AuthMode = options.auth ?? 'user'
      let user: User | null = null
      let profile: CurrentProfile | null = null

      if (auth === 'public') {
        try {
          const ctx = await getApiContext()
          user = ctx.user
          profile = ctx.profile
        } catch {
          // anonymous is fine
        }
      } else {
        const ctx = await getApiContext(auth === 'user' ? undefined : auth)
        user = ctx.user
        profile = ctx.profile
      }

      if (options.rateLimit) {
        await enforceRateLimit(options.rateLimit, user?.id ?? `ip:${await clientIp()}`)
      }

      let body: unknown = undefined
      if (options.body) {
        let json: unknown
        try {
          json = await request.json()
        } catch {
          throw new ApiError(400, 'VALIDATION_FAILED', 'Request body must be valid JSON.')
        }
        const parsed = options.body.safeParse(json)
        if (!parsed.success) {
          throw new ApiError(400, 'VALIDATION_FAILED', 'Some fields are invalid.', zodDetails(parsed.error))
        }
        body = parsed.data
      }

      let query: unknown = undefined
      if (options.query) {
        const url = new URL(request.url)
        const parsed = options.query.safeParse(Object.fromEntries(url.searchParams))
        if (!parsed.success) {
          throw new ApiError(400, 'VALIDATION_FAILED', 'Some query parameters are invalid.', zodDetails(parsed.error))
        }
        query = parsed.data
      }

      const rawParams = (await context?.params) ?? {}
      const params: Record<string, string> = {}
      for (const [k, v] of Object.entries(rawParams)) params[k] = Array.isArray(v) ? v.join('/') : v

      const db = await createServerSupabase()
      let adminClient: Db | null = null
      const admin = () => (adminClient ??= createAdminSupabase())

      const result = await options.handler({
        request,
        params,
        body,
        query,
        db,
        admin,
        requestId,
        user,
        profile,
      } as never)

      if (result instanceof Response) return result
      return NextResponse.json({ data: result ?? null }, { headers: { 'Cache-Control': 'no-store' } })
    } catch (err) {
      return errorResponse(err, requestId)
    }
  }
}
