/**
 * Maps Supabase Auth errors to message keys in `authDict.errors`. Pure, so it is unit-tested.
 * Messages never reveal whether an account exists for an email address.
 */

export type AuthErrorKey =
  | 'invalidCredentials'
  | 'emailNotConfirmed'
  | 'rateLimited'
  | 'weakPassword'
  | 'samePassword'
  | 'signupDisabled'
  | 'linkExpired'
  | 'generic'

type AuthErrorLike = { code?: string | null; message?: string | null; status?: number | null } | null | undefined

export function authErrorKey(error: AuthErrorLike): AuthErrorKey {
  if (!error) return 'generic'
  const code = error.code ?? ''
  const message = (error.message ?? '').toLowerCase()

  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) return 'invalidCredentials'
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) return 'emailNotConfirmed'
  if (
    code === 'over_request_rate_limit' ||
    code === 'over_email_send_rate_limit' ||
    error.status === 429 ||
    message.includes('rate limit')
  )
    return 'rateLimited'
  if (code === 'weak_password') return 'weakPassword'
  if (code === 'same_password' || message.includes('should be different from the old password')) return 'samePassword'
  if (code === 'signup_disabled' || code === 'email_provider_disabled') return 'signupDisabled'
  if (code === 'otp_expired' || code === 'flow_state_expired' || code === 'flow_state_not_found' || message.includes('expired'))
    return 'linkExpired'
  return 'generic'
}

/** Sign-up errors that must look exactly like success (account enumeration protection). */
export function isSilentSignUpError(error: AuthErrorLike): boolean {
  const code = error?.code ?? ''
  return code === 'user_already_exists' || code === 'email_exists' || code === 'identity_already_exists'
}

/** Email OTP types accepted by /auth/confirm. */
export const CONFIRM_TYPES = ['signup', 'email', 'recovery', 'invite', 'magiclink', 'email_change'] as const
export type ConfirmType = (typeof CONFIRM_TYPES)[number]
export function isConfirmType(value: unknown): value is ConfirmType {
  return typeof value === 'string' && (CONFIRM_TYPES as readonly string[]).includes(value)
}

/** httpOnly cookie set by /auth/confirm after a verified recovery link; bound to the user id. */
export const RECOVERY_COOKIE = 'sm_recovery'
export const RECOVERY_WINDOW_SECONDS = 15 * 60

/** Post-login destinations are same-origin paths and never an auth page (avoids loops). */
export function postAuthRedirect(next: string | null | undefined, fallback = '/dashboard'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  const path = next.split(/[?#]/)[0]!
  if (['/login', '/register', '/forgot-password', '/reset-password', '/verify-email'].includes(path)) return fallback
  if (path.startsWith('/auth/') || path.startsWith('/api/')) return fallback
  return next
}

/** Onboarding may continue to a student page only (e.g. the diagnostic from the homepage CTA). */
export function onboardingNext(next: string | null | undefined): string {
  const target = postAuthRedirect(next, '/dashboard')
  const path = target.split(/[?#]/)[0]!
  if (path === '/dashboard/onboarding' || !(path === '/dashboard' || path.startsWith('/dashboard/'))) return '/dashboard'
  return target
}
