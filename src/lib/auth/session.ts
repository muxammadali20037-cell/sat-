import 'server-only'
import { cache } from 'react'
import { notFound, redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { isSupabaseConfigured } from '@/lib/env'
import { createServerSupabase } from '@/lib/supabase/server'
import { ApiError } from '@/lib/api/errors'
import { hasRole, isRole, STAFF_ROLES, type Role } from '@/config/roles'
import { isLocale, type Locale } from '@/lib/i18n/config'
import type { Tables } from '@/types/database'

/**
 * Data Access Layer for identity. Every page, server action and route handler that touches
 * user data starts here. `proxy.ts` is NOT an authorization boundary.
 *
 * NOTE: `redirect()` and `notFound()` throw — never call these helpers inside a try/catch that
 * swallows errors.
 */

export type SubjectCode = 'math' | 'reading_writing'

export type CurrentProfile = {
  id: string
  email: string
  fullName: string
  role: Role
  locale: Locale
  timezone: string
  /** ISO country (pricing and payment methods); null until the student picks one. */
  countryCode: string | null
  satLevel: 'new' | 'some_prep' | 'experienced' | null
  targetScore: number | null
  examDate: string | null
  dailyStudyMinutes: number | null
  preferredSubjects: SubjectCode[]
  onboardingCompleted: boolean
  isSuspended: boolean
  createdAt: string
}

export function mapProfile(row: Tables<'profiles'>): CurrentProfile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: isRole(row.role) ? row.role : 'STUDENT',
    locale: isLocale(row.locale) ? row.locale : 'en',
    timezone: row.timezone,
    countryCode: row.country_code ?? null,
    satLevel: (row.sat_level as CurrentProfile['satLevel']) ?? null,
    targetScore: row.target_score,
    examDate: row.exam_date,
    dailyStudyMinutes: row.daily_study_minutes,
    preferredSubjects: (row.preferred_subjects ?? []).filter(
      (s): s is SubjectCode => s === 'math' || s === 'reading_writing',
    ),
    onboardingCompleted: row.onboarding_completed_at !== null,
    isSuspended: row.is_suspended,
    createdAt: row.created_at,
  }
}

/** Verified user from the Supabase Auth server, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  if (!isSupabaseConfigured) return null
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return data.user
})

/** Profile of the signed-in user, or null. Cached per request. */
export const getCurrentProfile = cache(async (): Promise<CurrentProfile | null> => {
  const user = await getCurrentUser()
  if (!user) return null
  const supabase = await createServerSupabase()
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (!data || data.deleted_at) return null
  return mapProfile(data)
})

/** Any signed-in, non-suspended user. Redirects otherwise. */
export async function requireUser(options: { next?: string } = {}): Promise<CurrentProfile> {
  const profile = await getCurrentProfile()
  if (!profile) {
    redirect(options.next ? `/login?next=${encodeURIComponent(options.next)}` : '/login')
  }
  if (profile.isSuspended) redirect('/account-suspended')
  return profile
}

/** Signed-in user who has completed onboarding (student app pages). */
export async function requireStudentReady(options: { next?: string } = {}): Promise<CurrentProfile> {
  const profile = await requireUser(options)
  // Staff can use the student app without completing student onboarding.
  if (!profile.onboardingCompleted && !hasRole(profile.role, STAFF_ROLES)) redirect('/dashboard/onboarding')
  return profile
}

/** Signed-in user with one of the allowed roles; others get a 404 (admin routes stay hidden). */
export async function requireRole(allowed: readonly Role[], options: { next?: string } = {}): Promise<CurrentProfile> {
  const profile = await requireUser(options)
  if (!hasRole(profile.role, allowed)) notFound()
  return profile
}

export async function isStaff(): Promise<boolean> {
  const profile = await getCurrentProfile()
  return hasRole(profile?.role, STAFF_ROLES)
}

/** For route handlers and server actions: throws ApiError instead of redirecting. */
export async function getApiContext(allowed?: readonly Role[]): Promise<{ user: User; profile: CurrentProfile }> {
  const user = await getCurrentUser()
  if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.')
  const profile = await getCurrentProfile()
  if (!profile) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.')
  if (profile.isSuspended) throw new ApiError(403, 'FORBIDDEN', 'This account is suspended.')
  if (allowed && !hasRole(profile.role, allowed)) throw new ApiError(403, 'FORBIDDEN', 'You do not have access to this action.')
  return { user, profile }
}
