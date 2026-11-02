'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ActionResult } from '@/lib/api/errors'
import { isGoogleAuthEnabled, isSupabaseConfigured, siteUrl } from '@/lib/env'
import { createServerSupabase } from '@/lib/supabase/server'
import { checkRateLimit, clientIp, RATE_LIMITS } from '@/lib/security/rate-limit'
import { getDict } from '@/lib/i18n/server'
import { authDict, type AuthErrorMessages } from '@/lib/i18n/dictionaries/auth'
import {
  emailOnlySchema,
  fieldErrorKeys,
  localizeFieldErrors,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  type EmailOnlyInput,
  type ResetPasswordInput,
  type SignInInput,
  type SignUpInput,
} from './schemas'
import {
  authErrorKey,
  isSilentSignUpError,
  onboardingNext,
  postAuthRedirect,
  RECOVERY_COOKIE,
  type AuthErrorKey,
} from './errors'

/**
 * Authentication server actions. Every action validates with the same Zod schema as its form,
 * is rate limited, and never reveals whether an account exists for an email address.
 * `redirect()` throws, so it is always called outside try/catch.
 */

export type AuthActionResult = ActionResult & { reason?: AuthErrorKey }

async function messages(): Promise<AuthErrorMessages> {
  return (await getDict(authDict, { public: true })).errors
}

function invalid(errors: AuthErrorMessages, zodError: Parameters<typeof fieldErrorKeys>[0]): AuthActionResult {
  return { ok: false, error: errors.checkFields, fieldErrors: localizeFieldErrors(fieldErrorKeys(zodError), errors) }
}

async function limited(rule: (typeof RATE_LIMITS)[keyof typeof RATE_LIMITS], identity: string): Promise<boolean> {
  const result = await checkRateLimit(rule, identity)
  return !result.allowed
}

export async function signUpAction(input: SignUpInput): Promise<AuthActionResult> {
  const t = await messages()
  if (!isSupabaseConfigured) return { ok: false, error: t.notConfigured }
  const parsed = signUpSchema.safeParse(input)
  if (!parsed.success) return invalid(t, parsed.error)

  const ip = await clientIp()
  if (await limited(RATE_LIMITS.authRegister, ip)) return { ok: false, error: t.rateLimited, reason: 'rateLimited' }

  const { fullName, email, password, locale, next } = parsed.data
  // After confirming, the student lands in onboarding; a deep link (e.g. the diagnostic) carries through.
  const afterOnboarding = next ? onboardingNext(next) : null
  const onboardingPath =
    afterOnboarding && afterOnboarding !== '/dashboard'
      ? `/dashboard/onboarding?next=${encodeURIComponent(afterOnboarding)}`
      : '/dashboard/onboarding'

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: siteUrl(`/auth/confirm?next=${encodeURIComponent(onboardingPath)}`),
      data: { full_name: fullName, locale },
    },
  })

  if (error && !isSilentSignUpError(error)) {
    const key = authErrorKey(error)
    if (key === 'weakPassword') return { ok: false, error: t.checkFields, fieldErrors: { password: [t.weakPassword] }, reason: key }
    if (key === 'rateLimited' || key === 'signupDisabled') return { ok: false, error: t[key], reason: key }
    console.error('[auth] signUp failed', { code: error.code, status: error.status })
    return { ok: false, error: t.generic, reason: 'generic' }
  }

  redirect(`/verify-email?email=${encodeURIComponent(email)}`)
}

export async function signInAction(input: SignInInput): Promise<AuthActionResult> {
  const t = await messages()
  if (!isSupabaseConfigured) return { ok: false, error: t.notConfigured }
  const parsed = signInSchema.safeParse(input)
  if (!parsed.success) return invalid(t, parsed.error)

  const { email, password, next } = parsed.data
  const ip = await clientIp()
  if (await limited(RATE_LIMITS.authLogin, `${ip}:${email}`)) return { ok: false, error: t.rateLimited, reason: 'rateLimited' }

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    const key = authErrorKey(error)
    if (key === 'invalidCredentials' || key === 'emailNotConfirmed' || key === 'rateLimited') {
      return { ok: false, error: t[key], reason: key }
    }
    console.error('[auth] signIn failed', { code: error.code, status: error.status })
    return { ok: false, error: t.generic, reason: 'generic' }
  }

  redirect(postAuthRedirect(next))
}

/** Always reports success (unless rate limited or invalid) so it cannot be used to probe accounts. */
export async function resendConfirmationAction(input: EmailOnlyInput): Promise<AuthActionResult> {
  const t = await messages()
  if (!isSupabaseConfigured) return { ok: false, error: t.notConfigured }
  const parsed = emailOnlySchema.safeParse(input)
  if (!parsed.success) return invalid(t, parsed.error)

  const ip = await clientIp()
  if (await limited(RATE_LIMITS.authRecover, `resend:${ip}`)) return { ok: false, error: t.rateLimited, reason: 'rateLimited' }

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: parsed.data.email,
    options: { emailRedirectTo: siteUrl('/auth/confirm?next=/dashboard/onboarding') },
  })
  if (error && authErrorKey(error) === 'rateLimited') return { ok: false, error: t.rateLimited, reason: 'rateLimited' }
  if (error) console.warn('[auth] resend returned an error (hidden from user)', { code: error.code, status: error.status })
  return { ok: true }
}

/** Always reports success (unless rate limited or invalid). */
export async function requestPasswordResetAction(input: EmailOnlyInput): Promise<AuthActionResult> {
  const t = await messages()
  if (!isSupabaseConfigured) return { ok: false, error: t.notConfigured }
  const parsed = emailOnlySchema.safeParse(input)
  if (!parsed.success) return invalid(t, parsed.error)

  const ip = await clientIp()
  if (await limited(RATE_LIMITS.authRecover, `reset:${ip}`)) return { ok: false, error: t.rateLimited, reason: 'rateLimited' }

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: siteUrl('/auth/confirm?next=/reset-password'),
  })
  if (error && authErrorKey(error) === 'rateLimited') return { ok: false, error: t.rateLimited, reason: 'rateLimited' }
  if (error) console.warn('[auth] resetPasswordForEmail returned an error (hidden from user)', { code: error.code, status: error.status })
  return { ok: true }
}

/**
 * Sets a new password from a recovery link. Requires the session created by /auth/confirm AND the
 * short-lived recovery cookie bound to that user, so a merely signed-in session cannot skip the
 * current-password check that Settings enforces.
 */
export async function updatePasswordAction(input: ResetPasswordInput): Promise<AuthActionResult> {
  const t = await messages()
  if (!isSupabaseConfigured) return { ok: false, error: t.notConfigured }
  const parsed = resetPasswordSchema.safeParse(input)
  if (!parsed.success) return invalid(t, parsed.error)

  const supabase = await createServerSupabase()
  const { data: userData } = await supabase.auth.getUser()
  const cookieStore = await cookies()
  const recoveryFor = cookieStore.get(RECOVERY_COOKIE)?.value
  if (!userData.user || !recoveryFor || recoveryFor !== userData.user.id) {
    return { ok: false, error: t.recoveryRequired, reason: 'linkExpired' }
  }

  if (await limited(RATE_LIMITS.authRecover, `update:${userData.user.id}`)) {
    return { ok: false, error: t.rateLimited, reason: 'rateLimited' }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    const key = authErrorKey(error)
    if (key === 'samePassword' || key === 'weakPassword') {
      return { ok: false, error: t.checkFields, fieldErrors: { password: [t[key]] }, reason: key }
    }
    if (key === 'rateLimited') return { ok: false, error: t.rateLimited, reason: key }
    console.error('[auth] updateUser(password) failed', { code: error.code, status: error.status })
    return { ok: false, error: t.generic, reason: 'generic' }
  }

  cookieStore.delete(RECOVERY_COOKIE)
  redirect('/dashboard?toast=password_updated')
}

/** Google OAuth (PKCE). Used with useActionState; on success the browser leaves for Google. */
export async function signInWithGoogleAction(_prev: AuthActionResult | null, formData: FormData): Promise<AuthActionResult> {
  const t = await messages()
  if (!isSupabaseConfigured) return { ok: false, error: t.notConfigured }
  if (!isGoogleAuthEnabled) return { ok: false, error: t.googleDisabled }

  const ip = await clientIp()
  if (await limited(RATE_LIMITS.authLogin, `oauth:${ip}`)) return { ok: false, error: t.rateLimited, reason: 'rateLimited' }

  const rawNext = formData.get('next')
  const next = postAuthRedirect(typeof rawNext === 'string' ? rawNext : null)
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: siteUrl(`/auth/callback?next=${encodeURIComponent(next)}`) },
  })
  if (error || !data.url) {
    console.error('[auth] signInWithOAuth failed', { code: error?.code, status: error?.status })
    return { ok: false, error: t.generic, reason: 'generic' }
  }
  redirect(data.url)
}
