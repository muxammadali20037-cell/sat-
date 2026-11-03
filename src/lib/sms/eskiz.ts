import 'server-only'
import { serverEnv } from '@/lib/env'

/**
 * Eskiz.uz SMS gateway (https://notify.eskiz.uz). Token from POST /auth/login (form: email, password),
 * cached in memory and renewed once on 401; SMS via POST /message/sms/send (form: mobile_phone as
 * 998XXXXXXXXX, message, from). Eskiz only delivers texts that match a template approved in the
 * Eskiz cabinet, so the verification text below must be submitted for moderation there.
 */

export class SmsError extends Error {}

let tokenCache: { token: string; at: number } | null = null

function config() {
  const env = serverEnv()
  if (!env.ESKIZ_EMAIL || !env.ESKIZ_PASSWORD) throw new SmsError('Eskiz is not configured (ESKIZ_EMAIL / ESKIZ_PASSWORD).')
  return { base: env.ESKIZ_API_BASE, email: env.ESKIZ_EMAIL, password: env.ESKIZ_PASSWORD, from: env.ESKIZ_FROM }
}

export const isSmsConfigured = () => {
  const env = serverEnv()
  return Boolean(env.ESKIZ_EMAIL && env.ESKIZ_PASSWORD && env.SEND_SMS_HOOK_SECRET)
}

async function login(fresh = false): Promise<string> {
  if (!fresh && tokenCache && Date.now() - tokenCache.at < 25 * 86_400_000) return tokenCache.token
  const { base, email, password } = config()
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    body: new URLSearchParams({ email, password }),
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  })
  const json = (await res.json().catch(() => null)) as { data?: { token?: string }; message?: string } | null
  const token = json?.data?.token
  if (!res.ok || !token) throw new SmsError(`Eskiz login failed (${res.status}): ${json?.message ?? 'no token'}`)
  tokenCache = { token, at: Date.now() }
  return token
}

/** Sends one SMS. `phone` is E.164 (+998…); Eskiz wants the digits without "+". */
export async function sendSms(phone: string, message: string): Promise<void> {
  const { base, from } = config()
  const mobile = phone.replace(/^\+/, '')
  const attempt = async (token: string) =>
    fetch(`${base}/message/sms/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: new URLSearchParams({ mobile_phone: mobile, message, from }),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
  let res = await attempt(await login())
  if (res.status === 401) res = await attempt(await login(true))
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new SmsError(`Eskiz send failed (${res.status}): ${body.slice(0, 200)}`)
  }
}

/** The verification text (submit exactly this template to Eskiz for approval). */
export const otpMessage = (otp: string) => `SAT MASTER: tasdiqlash kodingiz ${otp}. Kodni hech kimga bermang.`
