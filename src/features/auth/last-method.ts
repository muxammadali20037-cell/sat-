import 'server-only'
import { cookies } from 'next/headers'

/**
 * Remembers on this device which way the person signed in last time, so the log-in page can point
 * at it ("You used Google last time"). Only the method name is stored, never an email or account.
 */
export const AUTH_METHODS = ['email', 'google', 'apple', 'telegram', 'phone'] as const
export type AuthMethod = (typeof AUTH_METHODS)[number]
const COOKIE = 'sm_last_auth'

export async function rememberAuthMethod(method: AuthMethod) {
  ;(await cookies()).set(COOKIE, method, { path: '/', maxAge: 60 * 60 * 24 * 400, sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' })
}

export async function lastAuthMethod(): Promise<AuthMethod | null> {
  const v = (await cookies()).get(COOKIE)?.value
  return (AUTH_METHODS as readonly string[]).includes(v ?? '') ? (v as AuthMethod) : null
}
