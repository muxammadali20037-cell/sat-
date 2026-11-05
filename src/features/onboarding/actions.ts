'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { ApiError, type ActionResult } from '@/lib/api/errors'
import { getApiContext } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { getDict } from '@/lib/i18n/server'
import { LOCALE_COOKIE } from '@/lib/i18n/config'
import { onboardingDict } from '@/lib/i18n/dictionaries/onboarding'
import { localDate } from '@/lib/time'
import { fieldErrorKeys, localizeFieldErrors } from '@/features/auth/schemas'
import { onboardingNext } from '@/features/auth/errors'
import { onboardingSchema, type OnboardingInput } from './schemas'
import { guessCountry } from '@/config/countries'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { REFERRAL_COOKIE } from '@/features/referrals/logic'
import { claimReferral } from '@/features/referrals/server'

/**
 * Completes onboarding: validates every answer, updates the student's own profile through the
 * user-scoped client (RLS + column grants allow only these columns), stores the interface
 * language cookie and continues to the dashboard (or a validated deep link such as the diagnostic).
 */
export async function saveOnboardingAction(input: OnboardingInput & { next?: string }): Promise<ActionResult> {
  const t = (await getDict(onboardingDict)).errors

  let userId: string
  let timezone: string
  let ctxCountry: string | null
  try {
    const ctx = await getApiContext()
    userId = ctx.user.id
    timezone = ctx.profile.timezone
    ctxCountry = ctx.profile.countryCode
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : t.generic }
  }

  const parsed = onboardingSchema(localDate(timezone)).safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: t.checkFields, fieldErrors: localizeFieldErrors(fieldErrorKeys(parsed.error), t) }
  }
  const v = parsed.data

  const supabase = await createServerSupabase()
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: v.fullName,
      locale: v.locale,
      sat_level: v.satLevel,
      target_score: v.targetScore,
      exam_date: v.examDate,
      daily_study_minutes: v.dailyStudyMinutes,
      preferred_subjects: v.preferredSubjects,
      onboarding_completed_at: new Date().toISOString(),
      // A first guess from the time zone (Uzbekistan); the student can change it in Settings.
      ...(ctxCountry === null && guessCountry(timezone) ? { country_code: guessCountry(timezone) } : {}),
    })
    .eq('id', userId)
  if (error) {
    console.error('[onboarding] profile update failed', { code: error.code, message: error.message })
    return { ok: false, error: t.generic }
  }

  const cookieStore = await cookies()
  cookieStore.set(LOCALE_COOKIE, v.locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  // Joined through a friend's invite link: link the new account to the friend (server rules apply).
  const refCode = cookieStore.get(REFERRAL_COOKIE)?.value
  if (refCode) {
    try {
      await claimReferral(createAdminSupabase(), userId, refCode)
    } catch (err) {
      console.error('[onboarding] referral claim failed', err)
    }
    cookieStore.delete(REFERRAL_COOKIE)
  }
  revalidatePath('/dashboard', 'layout')
  redirect(onboardingNext(input.next))
}
