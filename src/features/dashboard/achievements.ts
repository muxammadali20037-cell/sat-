/**
 * Achievements (pure, unit-tested). Every badge is computed from the student's own records each
 * time the dashboard loads; nothing is granted by hand, so a badge can never be fake.
 */
import { addDays } from '@/lib/time'
import { isActiveDay, type ActivityDay } from './logic'

export type AchievementId =
  | 'first_diagnostic'
  | 'questions_100'
  | 'questions_500'
  | 'questions_1000'
  | 'streak_7'
  | 'streak_30'
  | 'first_mock'
  | 'mocks_4'
  | 'lessons_10'
  | 'domain_advanced'

export type Achievement = { id: AchievementId; earned: boolean; value: number; target: number }

export type AchievementInput = {
  diagnosticsCompleted: number
  scoredAnswers: number
  longestStreak: number
  mocksCompleted: number
  lessonsCompleted: number
  /** Domains at the Advanced level with at least ADVANCED_DOMAIN_MIN_ANSWERS answers. */
  advancedDomains: number
}

export const ADVANCED_DOMAIN_MIN_ANSWERS = 20

const RULES: Array<{ id: AchievementId; target: number; value: (i: AchievementInput) => number }> = [
  { id: 'first_diagnostic', target: 1, value: (i) => i.diagnosticsCompleted },
  { id: 'questions_100', target: 100, value: (i) => i.scoredAnswers },
  { id: 'questions_500', target: 500, value: (i) => i.scoredAnswers },
  { id: 'questions_1000', target: 1000, value: (i) => i.scoredAnswers },
  { id: 'streak_7', target: 7, value: (i) => i.longestStreak },
  { id: 'streak_30', target: 30, value: (i) => i.longestStreak },
  { id: 'first_mock', target: 1, value: (i) => i.mocksCompleted },
  { id: 'mocks_4', target: 4, value: (i) => i.mocksCompleted },
  { id: 'lessons_10', target: 10, value: (i) => i.lessonsCompleted },
  { id: 'domain_advanced', target: 1, value: (i) => i.advancedDomains },
]

export function achievements(input: AchievementInput): Achievement[] {
  return RULES.map((r) => {
    const value = Math.max(0, r.value(input))
    return { id: r.id, earned: value >= r.target, value: Math.min(value, r.target), target: r.target }
  })
}

/** Longest run of consecutive active days (same "active" rule as the streak). */
export function longestStreak(rows: Array<Pick<ActivityDay, 'activity_date' | 'study_seconds' | 'questions_answered' | 'lessons_completed'>>): number {
  const days = [...new Set(rows.filter(isActiveDay).map((r) => r.activity_date))].sort()
  let best = 0
  let run = 0
  let prev: string | null = null
  for (const d of days) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1
    best = Math.max(best, run)
    prev = d
  }
  return best
}
