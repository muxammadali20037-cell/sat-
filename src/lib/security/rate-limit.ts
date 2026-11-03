import 'server-only'
import { headers } from 'next/headers'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { ApiError } from '@/lib/api/errors'

export type RateLimitRule = { bucket: string; limit: number; windowSec: number }

export type RateLimitResult = { allowed: boolean; remaining: number; resetAt: string | null }

/**
 * Fixed-window rate limit backed by Postgres (public.rate_limit_hit), shared by every
 * serverless instance. If the limiter itself fails (DB outage) we fail OPEN and log, so a
 * limiter problem never locks every student out; the DB outage is surfaced elsewhere.
 */
export async function checkRateLimit(rule: RateLimitRule, identity: string): Promise<RateLimitResult> {
  try {
    const admin = createAdminSupabase()
    const { data, error } = await admin.rpc('rate_limit_hit', {
      p_key: `${rule.bucket}:${identity}`,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSec,
    })
    if (error) throw error
    const row = data?.[0]
    return { allowed: row?.allowed ?? true, remaining: row?.remaining ?? rule.limit, resetAt: row?.reset_at ?? null }
  } catch (err) {
    console.error('[rate-limit] limiter unavailable, failing open', { bucket: rule.bucket, err })
    return { allowed: true, remaining: rule.limit, resetAt: null }
  }
}

/** Throws ApiError(429) when the limit is exceeded. */
export async function enforceRateLimit(rule: RateLimitRule, identity: string): Promise<void> {
  const result = await checkRateLimit(rule, identity)
  if (!result.allowed) {
    throw new ApiError(429, 'RATE_LIMITED', 'Too many requests. Please wait a moment and try again.', {
      resetAt: result.resetAt,
    })
  }
}

/** Best-effort client IP for anonymous rate limiting (auth forms, contact form). */
export async function clientIp(): Promise<string> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return h.get('x-real-ip') ?? 'unknown'
}

export const RATE_LIMITS = {
  authLogin: { bucket: 'auth-login', limit: 10, windowSec: 300 },
  authRegister: { bucket: 'auth-register', limit: 5, windowSec: 3600 },
  authRecover: { bucket: 'auth-recover', limit: 5, windowSec: 3600 },
  // SMS codes cost money: per phone number and per IP.
  authPhone: { bucket: 'auth-phone', limit: 5, windowSec: 3600 },
  telegramAuth: { bucket: 'telegram-auth', limit: 20, windowSec: 300 },
  // The website polls a Telegram sign-in request every 2 s for up to 10 minutes.
  telegramPoll: { bucket: 'telegram-poll', limit: 90, windowSec: 60 },
  contact: { bucket: 'contact', limit: 5, windowSec: 3600 },
  ai: { bucket: 'ai', limit: 10, windowSec: 60 },
  checkout: { bucket: 'checkout', limit: 10, windowSec: 600 },
  answer: { bucket: 'answer', limit: 120, windowSec: 60 },
  start: { bucket: 'start', limit: 30, windowSec: 300 },
  progress: { bucket: 'progress', limit: 30, windowSec: 60 },
  admin: { bucket: 'admin', limit: 120, windowSec: 60 },
  // Mock exams: own buckets so practice traffic never blocks a timed module (and vice versa).
  examAction: { bucket: 'exam-action', limit: 30, windowSec: 300 },
  examAnswer: { bucket: 'exam-answer', limit: 240, windowSec: 60 },
  examState: { bucket: 'exam-state', limit: 120, windowSec: 60 },
} as const satisfies Record<string, RateLimitRule>
