import { z } from 'zod'

/**
 * Environment access. Public values (NEXT_PUBLIC_*) are inlined at build time; server values
 * must never be read in the browser — `serverEnv()` throws if called client-side.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().default('http://localhost:3000'),
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20).optional(),
  NEXT_PUBLIC_ENABLE_GOOGLE_AUTH: z.enum(['true', 'false']).default('false'),
  /** Desmos API key (desmos.com/my-api). Public by design — Desmos keys are domain-bound browser keys. */
  NEXT_PUBLIC_DESMOS_API_KEY: z.string().min(8).optional(),
  NEXT_PUBLIC_DESMOS_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default('v1.13'),
  /** Shows "sign in with phone (SMS code)" once Supabase phone auth + the SMS hook are set up. */
  NEXT_PUBLIC_ENABLE_PHONE_AUTH: z.enum(['true', 'false']).default('false'),
})

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
  NEXT_PUBLIC_ENABLE_GOOGLE_AUTH: process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH || undefined,
  NEXT_PUBLIC_DESMOS_API_KEY: process.env.NEXT_PUBLIC_DESMOS_API_KEY || undefined,
  NEXT_PUBLIC_DESMOS_API_VERSION: process.env.NEXT_PUBLIC_DESMOS_API_VERSION || undefined,
  NEXT_PUBLIC_ENABLE_PHONE_AUTH: process.env.NEXT_PUBLIC_ENABLE_PHONE_AUTH || undefined,
})

export const isSupabaseConfigured = Boolean(
  publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
)
export const isGoogleAuthEnabled = publicEnv.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === 'true'
export const isDesmosConfigured = Boolean(publicEnv.NEXT_PUBLIC_DESMOS_API_KEY)
export const isPhoneAuthEnabled = publicEnv.NEXT_PUBLIC_ENABLE_PHONE_AUTH === 'true'

const optional = z.string().min(1).optional()

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SUPABASE_SERVICE_ROLE_KEY: optional,
  ANTHROPIC_API_KEY: optional,
  AI_PROVIDER: z.enum(['anthropic', 'mock']).default('anthropic'),
  AI_MODEL_TUTOR: z.string().default('claude-sonnet-5-5'),
  AI_MODEL_FAST: z.string().default('claude-haiku-5-5'),
  BUNNY_STREAM_CDN_HOST: optional,
  BUNNY_STREAM_TOKEN_KEY: optional,
  CLICK_SERVICE_ID: optional,
  CLICK_MERCHANT_ID: optional,
  CLICK_MERCHANT_USER_ID: optional,
  CLICK_SECRET_KEY: optional,
  PAYME_MERCHANT_ID: optional,
  PAYME_KEY: optional,
  PAYME_TEST_KEY: optional,
  PAYME_TEST_MODE: z.enum(['true', 'false']).default('false'),
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  PAYMENTS_TEST_MODE: z.enum(['true', 'false']).default('false'),
  PAYMENTS_TEST_WEBHOOK_SECRET: optional,
  /** Shared secret for scheduled jobs (Vercel Cron sends it as `Authorization: Bearer …`). */
  CRON_SECRET: optional,
  /** Telegram bot (BotFather token). Enables the Mini App sign-in and the bot webhook. */
  TELEGRAM_BOT_TOKEN: z.string().regex(/^\d+:[\w-]{30,}$/, 'Expected a BotFather token like 123456:ABC…').optional(),
  /** Secret Telegram sends back in X-Telegram-Bot-Api-Secret-Token on every webhook call (1–256 chars of A–Z a–z 0–9 _ -). */
  TELEGRAM_WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]{16,256}$/, 'Use 16–256 characters: letters, digits, _ and -').optional(),
  /** Telegram Bot API base (tests point it at a local mock; production leaves it unset). */
  TELEGRAM_API_BASE: z.url().default('https://api.telegram.org'),
  /** SMS codes for phone sign-in: Eskiz.uz account and the Supabase "Send SMS" hook secret (v1,whsec_…). */
  ESKIZ_EMAIL: optional,
  ESKIZ_PASSWORD: optional,
  ESKIZ_FROM: z.string().min(1).default('4546'),
  ESKIZ_API_BASE: z.url().default('https://notify.eskiz.uz/api'),
  SEND_SMS_HOOK_SECRET: z.string().regex(/^(v1,)?whsec_[A-Za-z0-9+/=]+$/, 'Copy the secret from Supabase: v1,whsec_…').optional(),
})

export type ServerEnv = z.infer<typeof serverSchema>

let cached: ServerEnv | null = null
let problems: EnvProblem[] = []

export type EnvProblem = { key: string; message: string }

/**
 * Server settings, validated once per process. Every server setting is optional or has a default,
 * so one malformed value must not take the whole site down: an invalid value is logged, treated as
 * "not set" (or its default), and reported in the admin panel through serverEnvProblems().
 */
export function serverEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() must not be called in the browser')
  }
  if (!cached) {
    const raw: Record<string, string | undefined> = {}
    for (const key of Object.keys(serverSchema.shape)) {
      const value = process.env[key]
      raw[key] = value === '' ? undefined : value
    }
    const result = serverSchema.safeParse(raw)
    if (result.success) {
      cached = result.data
      problems = []
    } else {
      problems = result.error.issues.map((issue) => ({ key: String(issue.path[0]), message: issue.message }))
      for (const { key, message } of problems) {
        raw[key] = undefined
        // Name and rule only — never the value, which may be a secret.
        console.error(`[env] ${key} is set but invalid (${message}); treating it as not set.`)
      }
      cached = serverSchema.parse(raw)
    }
  }
  return cached
}

/** Settings that are present but invalid (ignored at runtime). Shown to admins. */
export function serverEnvProblems(): EnvProblem[] {
  serverEnv()
  return problems
}

export const isProduction = () => serverEnv().NODE_ENV === 'production'

/** Absolute URL on this site, for auth redirects and payment return URLs. */
export function siteUrl(path = '/'): string {
  return new URL(path, publicEnv.NEXT_PUBLIC_SITE_URL).toString()
}
