import { z } from 'zod'
import { fullNameSchema, uiLocaleSchema } from '@/features/auth/schemas'
import {
  dailyMinutesSchema,
  isoDateSchema,
  satLevelSchema,
  subjectsSchema,
  targetScoreSchema,
} from '@/features/onboarding/schemas'
import type { TablesUpdate } from '@/types/database'
import { COUNTRY_CODES } from '@/config/countries'

/** Time zones offered in Settings (students are mostly in Central Asia; UTC as a neutral option). */
export const TIME_ZONES = [
  'Asia/Tashkent',
  'Asia/Samarkand',
  'Asia/Almaty',
  'Asia/Bishkek',
  'Asia/Dushanbe',
  'Asia/Ashgabat',
  'Europe/Moscow',
  'Europe/Istanbul',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Seoul',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'UTC',
] as const
export type TimeZone = (typeof TIME_ZONES)[number]

/**
 * Whitelist of profile fields a student may change (mirrors the column-level GRANT UPDATE on
 * public.profiles). Strict: unknown keys such as `role` or `is_suspended` are rejected outright.
 * The exam date's "in the future" rule depends on the student's time zone, so it is checked by
 * the caller with `examDateIsAcceptable`.
 */
export const profileUpdateSchema = z
  .strictObject({
    fullName: fullNameSchema.optional(),
    locale: uiLocaleSchema.optional(),
    timezone: z.enum(TIME_ZONES, 'timezoneInvalid').optional(),
    countryCode: z.enum(COUNTRY_CODES, 'countryInvalid').nullable().optional(),
    satLevel: satLevelSchema.optional(),
    targetScore: targetScoreSchema.optional(),
    examDate: isoDateSchema.nullable().optional(),
    dailyStudyMinutes: dailyMinutesSchema.optional(),
    preferredSubjects: subjectsSchema.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'nothingToUpdate')
export type ProfileUpdateInput = z.input<typeof profileUpdateSchema>
export type ProfileUpdate = z.output<typeof profileUpdateSchema>

/** Settings → Profile section. */
export const profileSectionSchema = z.object({
  fullName: fullNameSchema,
  timezone: z.enum(TIME_ZONES, 'timezoneInvalid'),
  countryCode: z.enum(COUNTRY_CODES, 'countryInvalid'),
})
export type ProfileSectionInput = z.input<typeof profileSectionSchema>

/** Settings → Learning goals section (exam date checked against "today" separately). */
export const goalsSectionSchema = z.object({
  targetScore: targetScoreSchema,
  examDate: isoDateSchema.nullable(),
  dailyStudyMinutes: dailyMinutesSchema,
  preferredSubjects: subjectsSchema,
})
export type GoalsSectionInput = z.input<typeof goalsSectionSchema>

/** null (not decided) is always fine; otherwise the date must be after today in the student's zone. */
export function examDateIsAcceptable(examDate: string | null | undefined, today: string): boolean {
  return examDate === null || examDate === undefined || examDate > today
}

/** camelCase API fields → `profiles` columns. Only whitelisted columns can ever be produced. */
export function toProfileColumns(update: ProfileUpdate): TablesUpdate<'profiles'> {
  const out: TablesUpdate<'profiles'> = {}
  if (update.fullName !== undefined) out.full_name = update.fullName
  if (update.locale !== undefined) out.locale = update.locale
  if (update.timezone !== undefined) out.timezone = update.timezone
  if (update.countryCode !== undefined) out.country_code = update.countryCode
  if (update.satLevel !== undefined) out.sat_level = update.satLevel
  if (update.targetScore !== undefined) out.target_score = update.targetScore
  if (update.examDate !== undefined) out.exam_date = update.examDate
  if (update.dailyStudyMinutes !== undefined) out.daily_study_minutes = update.dailyStudyMinutes
  if (update.preferredSubjects !== undefined) out.preferred_subjects = update.preferredSubjects
  return out
}

/** Shape returned by GET/PATCH /api/student/profile. */
export type StudentProfileDto = {
  id: string
  email: string
  fullName: string
  locale: string
  timezone: string
  satLevel: string | null
  targetScore: number | null
  examDate: string | null
  dailyStudyMinutes: number | null
  preferredSubjects: string[]
  onboardingCompleted: boolean
}

export const PROFILE_DTO_COLUMNS =
  'id, email, full_name, locale, timezone, sat_level, target_score, exam_date, daily_study_minutes, preferred_subjects, onboarding_completed_at' as const

export function toProfileDto(row: {
  id: string
  email: string
  full_name: string
  locale: string
  timezone: string
  sat_level: string | null
  target_score: number | null
  exam_date: string | null
  daily_study_minutes: number | null
  preferred_subjects: string[]
  onboarding_completed_at: string | null
}): StudentProfileDto {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    locale: row.locale,
    timezone: row.timezone,
    satLevel: row.sat_level,
    targetScore: row.target_score,
    examDate: row.exam_date,
    dailyStudyMinutes: row.daily_study_minutes,
    preferredSubjects: row.preferred_subjects,
    onboardingCompleted: row.onboarding_completed_at !== null,
  }
}
