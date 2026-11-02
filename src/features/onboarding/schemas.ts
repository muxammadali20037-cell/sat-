import { z } from 'zod'
import { fullNameSchema, uiLocaleSchema } from '@/features/auth/schemas'
import { addDays } from '@/lib/time'

/**
 * Onboarding / learning-goal field schemas. Shared by the wizard (per-step validation), the
 * onboarding server action, Settings and PATCH /api/student/profile. Ranges mirror the
 * `profiles` CHECK constraints (target 400–1600 step 10; 10–600 minutes; 1–2 subjects).
 * Messages are keys into `onboardingDict.errors`.
 */

export const SCORE_MIN = 400
export const SCORE_MAX = 1600
export const SCORE_STEP = 10
export const MINUTES_MIN = 10
export const MINUTES_MAX = 600
export const MINUTE_PRESETS = [15, 30, 45, 60, 90, 120] as const
/** Exam dates further out than this are almost certainly typos. */
export const EXAM_DATE_MAX_DAYS = 3 * 366

export const SAT_LEVELS = ['new', 'some_prep', 'experienced'] as const
export type SatLevel = (typeof SAT_LEVELS)[number]
export const SUBJECTS = ['math', 'reading_writing'] as const
export type Subject = (typeof SUBJECTS)[number]

export const satLevelSchema = z.enum(SAT_LEVELS, 'levelRequired')

export const targetScoreSchema = z
  .number('scoreRequired')
  .int('scoreStep')
  .min(SCORE_MIN, 'scoreRange')
  .max(SCORE_MAX, 'scoreRange')
  .refine((n) => n % SCORE_STEP === 0, 'scoreStep')

export const dailyMinutesSchema = z
  .number('minutesRequired')
  .int('minutesRange')
  .min(MINUTES_MIN, 'minutesRange')
  .max(MINUTES_MAX, 'minutesRange')

export const subjectsSchema = z
  .array(z.enum(SUBJECTS))
  .min(1, 'subjectsRequired')
  .max(2, 'subjectsRequired')
  .refine((list) => new Set(list).size === list.length, 'subjectsRequired')

export const isoDateSchema = z.iso.date('dateInvalid')

/** A calendar date strictly after `today` (YYYY-MM-DD in the student's time zone). */
export function examDateSchema(today: string) {
  return isoDateSchema
    .refine((d) => d > today, 'dateInPast')
    .refine((d) => d <= addDays(today, EXAM_DATE_MAX_DAYS), 'dateTooFar')
}

export function onboardingSchema(today: string) {
  return z.object({
    fullName: fullNameSchema,
    locale: uiLocaleSchema,
    satLevel: satLevelSchema,
    targetScore: targetScoreSchema,
    examDate: examDateSchema(today).nullable(),
    dailyStudyMinutes: dailyMinutesSchema,
    preferredSubjects: subjectsSchema,
  })
}
export type OnboardingInput = z.input<ReturnType<typeof onboardingSchema>>

/** Field names validated by each wizard step (1-based steps → index 0..6). */
export const ONBOARDING_STEP_FIELDS = [
  ['fullName'],
  ['locale'],
  ['satLevel'],
  ['targetScore'],
  ['examDate'],
  ['dailyStudyMinutes'],
  ['preferredSubjects'],
] as const satisfies ReadonlyArray<ReadonlyArray<keyof OnboardingInput>>

export type OnboardingDraft = {
  fullName: string
  locale: 'en' | 'uz'
  satLevel: SatLevel | null
  targetScore: number
  examDate: string | null
  dailyStudyMinutes: number | null
  preferredSubjects: Subject[]
}

/** Validates only the fields of one step; returns `{ field: messageKey }` (empty = valid). */
export function validateOnboardingStep(step: number, draft: OnboardingDraft, today: string): Record<string, string> {
  const fields = ONBOARDING_STEP_FIELDS[step]
  if (!fields) return {}
  const shape = onboardingSchema(today).shape
  const errors: Record<string, string> = {}
  for (const field of fields) {
    const result = shape[field].safeParse(draft[field])
    if (!result.success) errors[field] = result.error.issues[0]?.message ?? 'invalid'
  }
  return errors
}

/** Snap any number to the 400–1600 scale in steps of 10. */
export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return SCORE_MIN
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, Math.round(value / SCORE_STEP) * SCORE_STEP))
}

/** Position of a score on the 400–1600 scale, 0..1 (for the scale marker). */
export function scorePosition(score: number): number {
  return (clampScore(score) - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)
}
