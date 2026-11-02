'use server'

import { revalidatePath } from 'next/cache'
import { ApiError, type ActionResult } from '@/lib/api/errors'
import { getApiContext } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit'
import { getDict } from '@/lib/i18n/server'
import { onboardingDict } from '@/lib/i18n/dictionaries/onboarding'
import { settingsDict } from '@/lib/i18n/dictionaries/settings'
import { authDict } from '@/lib/i18n/dictionaries/auth'
import { localDate } from '@/lib/time'
import { changePasswordSchema, fieldErrorKeys, localizeFieldErrors, type ChangePasswordInput } from '@/features/auth/schemas'
import { authErrorKey } from '@/features/auth/errors'
import {
  examDateIsAcceptable,
  goalsSectionSchema,
  profileSectionSchema,
  toProfileColumns,
  type GoalsSectionInput,
  type ProfileSectionInput,
} from './schemas'

/** Settings server actions. Each authorizes via the DAL, validates with Zod and updates only whitelisted columns. */

async function context() {
  try {
    return await getApiContext()
  } catch (err) {
    if (err instanceof ApiError) return null
    throw err
  }
}

async function messages() {
  const [settings, onboarding] = await Promise.all([getDict(settingsDict), getDict(onboardingDict)])
  return { s: settings, fieldMessages: onboarding.errors as Record<string, string> }
}

export async function updateProfileSectionAction(input: ProfileSectionInput): Promise<ActionResult> {
  const { s, fieldMessages } = await messages()
  const ctx = await context()
  if (!ctx) return { ok: false, error: s.errors.unauthenticated }

  const parsed = profileSectionSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: s.errors.checkFields, fieldErrors: localizeFieldErrors(fieldErrorKeys(parsed.error), fieldMessages) }
  }

  const supabase = await createServerSupabase()
  const { error } = await supabase.from('profiles').update(toProfileColumns(parsed.data)).eq('id', ctx.user.id)
  if (error) {
    console.error('[settings] profile update failed', { code: error.code })
    return { ok: false, error: s.errors.generic }
  }
  revalidatePath('/dashboard', 'layout')
  return { ok: true, message: s.profile.saved }
}

export async function updateGoalsSectionAction(input: GoalsSectionInput): Promise<ActionResult> {
  const { s, fieldMessages } = await messages()
  const ctx = await context()
  if (!ctx) return { ok: false, error: s.errors.unauthenticated }

  const parsed = goalsSectionSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: s.errors.checkFields, fieldErrors: localizeFieldErrors(fieldErrorKeys(parsed.error), fieldMessages) }
  }
  if (!examDateIsAcceptable(parsed.data.examDate, localDate(ctx.profile.timezone))) {
    return { ok: false, error: s.errors.checkFields, fieldErrors: { examDate: [fieldMessages.dateInPast!] } }
  }

  const supabase = await createServerSupabase()
  const { error } = await supabase.from('profiles').update(toProfileColumns(parsed.data)).eq('id', ctx.user.id)
  if (error) {
    console.error('[settings] goals update failed', { code: error.code })
    return { ok: false, error: s.errors.generic }
  }
  revalidatePath('/dashboard', 'layout')
  return { ok: true, message: s.goals.saved }
}

/** Re-authenticates with the current password before setting a new one. */
export async function changePasswordAction(input: ChangePasswordInput): Promise<ActionResult> {
  const [{ s }, auth] = await Promise.all([messages(), getDict(authDict)])
  const ctx = await context()
  if (!ctx) return { ok: false, error: s.errors.unauthenticated }

  const parsed = changePasswordSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: s.errors.checkFields, fieldErrors: localizeFieldErrors(fieldErrorKeys(parsed.error), auth.errors) }
  }

  const rate = await checkRateLimit(RATE_LIMITS.authLogin, `password-change:${ctx.user.id}`)
  if (!rate.allowed) return { ok: false, error: s.errors.rateLimited }

  const email = ctx.user.email ?? ctx.profile.email
  const supabase = await createServerSupabase()
  const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: parsed.data.currentPassword })
  if (verifyError) {
    const key = authErrorKey(verifyError)
    if (key === 'rateLimited') return { ok: false, error: s.errors.rateLimited }
    return { ok: false, error: s.errors.checkFields, fieldErrors: { currentPassword: [s.security.wrongCurrent] } }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword })
  if (error) {
    const key = authErrorKey(error)
    if (key === 'samePassword' || key === 'weakPassword') {
      return { ok: false, error: s.errors.checkFields, fieldErrors: { newPassword: [auth.errors[key]] } }
    }
    console.error('[settings] password update failed', { code: error.code, status: error.status })
    return { ok: false, error: s.errors.generic }
  }
  return { ok: true, message: s.security.changed }
}
