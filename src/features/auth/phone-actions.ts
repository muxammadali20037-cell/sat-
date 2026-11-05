'use server'

import { rememberAuthMethod } from './last-method'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { isPhoneAuthEnabled, isSupabaseConfigured } from '@/lib/env'
import { createServerSupabase } from '@/lib/supabase/server'
import { checkRateLimit, clientIp, RATE_LIMITS } from '@/lib/security/rate-limit'
import { getDict } from '@/lib/i18n/server'
import { authDict } from '@/lib/i18n/dictionaries/auth'
import { getLocale } from '@/lib/i18n/server'
import { postAuthRedirect } from './errors'
import { normalizeUzPhone } from './phone'

/**
 * Sign in or register with a phone number. Supabase creates, sends (through the Send SMS hook →
 * Eskiz) and checks the 6-digit code; we only validate input, rate limit and set the session.
 */

type PhoneResult = { ok: true } | { ok: false; error: string }

export async function sendPhoneCodeAction(input: { phone: string }): Promise<PhoneResult> {
  const t = (await getDict(authDict, { public: true })).phone
  if (!isSupabaseConfigured || !isPhoneAuthEnabled) return { ok: false, error: t.unavailable }
  const phone = normalizeUzPhone(String(input?.phone ?? ''))
  if (!phone) return { ok: false, error: t.invalidPhone }

  const ip = await clientIp()
  for (const id of [`ip:${ip}`, `phone:${phone}`]) {
    if (!(await checkRateLimit(RATE_LIMITS.authPhone, id)).allowed) return { ok: false, error: t.rateLimited }
  }
  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: true, data: { locale: await getLocale() } } })
  if (error) {
    console.warn('[auth] signInWithOtp(phone) failed', { code: error.code, status: error.status })
    return { ok: false, error: error.status === 429 ? t.rateLimited : t.sendFailed }
  }
  return { ok: true }
}

const VerifySchema = z.object({ phone: z.string(), code: z.string().regex(/^\d{6}$/), next: z.string().max(300).optional() })

export async function verifyPhoneCodeAction(input: { phone: string; code: string; next?: string }): Promise<PhoneResult> {
  const t = (await getDict(authDict, { public: true })).phone
  if (!isSupabaseConfigured || !isPhoneAuthEnabled) return { ok: false, error: t.unavailable }
  const parsed = VerifySchema.safeParse(input)
  const phone = parsed.success ? normalizeUzPhone(parsed.data.phone) : null
  if (!parsed.success || !phone) return { ok: false, error: t.invalidCode }

  const ip = await clientIp()
  if (!(await checkRateLimit(RATE_LIMITS.authLogin, `otp:${ip}:${phone}`)).allowed) return { ok: false, error: t.rateLimited }

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.verifyOtp({ phone, token: parsed.data.code, type: 'sms' })
  if (error) return { ok: false, error: error.code === 'otp_expired' ? t.expiredCode : t.invalidCode }
  await rememberAuthMethod('phone')
  redirect(postAuthRedirect(parsed.data.next, '/dashboard'))
}
