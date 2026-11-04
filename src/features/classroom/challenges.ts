/**
 * Class challenges and the opt-in progress leaderboard (pure, client-safe, unit-tested).
 *
 * Everything is computed from real activity rows (`user_daily_activity`, one row per student per
 * local day). The leaderboard ranks weekly *effort* — correct answers, active days and class work
 * handed in — never a raw score, and only students who chose to appear are shown by name.
 */
import { z } from 'zod'
import { addDays } from '@/lib/time'

const id = z.guid()
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const METRICS = ['correct_answers', 'active_days', 'study_minutes'] as const
export type ChallengeMetric = (typeof METRICS)[number]

export const CreateChallengeSchema = z
  .object({
    workspaceId: id,
    groupId: id,
    title: z.string().trim().min(2).max(120),
    metric: z.enum(METRICS),
    mode: z.enum(['individual', 'group']),
    target: z.number().int().min(1).max(100000),
    startsOn: date,
    endsOn: date,
  })
  .refine((v) => v.endsOn >= v.startsOn, { path: ['endsOn'], message: 'order' })
  .refine((v) => (Date.parse(v.endsOn) - Date.parse(v.startsOn)) / 86_400_000 <= 92, { path: ['endsOn'], message: 'too long' })
export type CreateChallengeInput = z.input<typeof CreateChallengeSchema>

export const ChallengeRefSchema = z.object({ challengeId: id })
export const LeaderboardOptInSchema = z.object({ workspaceId: id, enabled: z.boolean() })

export type ActivityRow = { user_id: string; activity_date: string; study_seconds: number; questions_answered: number; correct_answers: number; lessons_completed: number }

/** Same rule as the dashboard: a day counts when something was actually studied. */
export const isActive = (r: Pick<ActivityRow, 'questions_answered' | 'study_seconds' | 'lessons_completed'>) =>
  r.questions_answered > 0 || r.study_seconds >= 60 || r.lessons_completed > 0

/** Monday–Sunday week containing `today` (YYYY-MM-DD in the workspace's time zone). */
export function weekRange(today: string): { from: string; to: string } {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay()
  const from = addDays(today, -((dow + 6) % 7))
  return { from, to: addDays(from, 6) }
}

export function metricValue(metric: ChallengeMetric, rows: ActivityRow[]): number {
  if (metric === 'correct_answers') return rows.reduce((s, r) => s + r.correct_answers, 0)
  if (metric === 'study_minutes') return Math.floor(rows.reduce((s, r) => s + r.study_seconds, 0) / 60)
  return new Set(rows.filter(isActive).map((r) => r.activity_date)).size
}

/** Weekly points: 1 per correct answer, 10 per active day, 20 per piece of class work handed in. */
export const POINTS = { correct: 1, activeDay: 10, classWork: 20 } as const

export function weeklyPoints(rows: ActivityRow[], classWorkSubmitted: number) {
  const correct = metricValue('correct_answers', rows)
  const activeDays = metricValue('active_days', rows)
  return { correct, activeDays, classWork: classWorkSubmitted, points: correct * POINTS.correct + activeDays * POINTS.activeDay + classWorkSubmitted * POINTS.classWork }
}

export type LeaderboardEntry = { studentId: string; name: string; points: number; correct: number; activeDays: number; classWork: number; rank: number; self: boolean }

/** Standard competition ranking (1, 2, 2, 4); students with no activity this week are left out. */
export function rankEntries(entries: Array<Omit<LeaderboardEntry, 'rank'>>): LeaderboardEntry[] {
  const sorted = entries.filter((e) => e.points > 0).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
  let rank = 0
  return sorted.map((e, i) => {
    if (i === 0 || e.points < sorted[i - 1]!.points) rank = i + 1
    return { ...e, rank }
  })
}

export type ChallengeProgress = {
  value: number
  target: number
  ratio: number
  done: boolean
}

export const progress = (value: number, target: number): ChallengeProgress => ({ value, target, ratio: Math.min(1, value / target), done: value >= target })

/** Rows inside a challenge's date range (inclusive). */
export const inRange = (rows: ActivityRow[], from: string, to: string) => rows.filter((r) => r.activity_date >= from && r.activity_date <= to)

export type ChallengeTiming = 'upcoming' | 'running' | 'finished'
export function challengeTiming(startsOn: string, endsOn: string, today: string, status: string): ChallengeTiming {
  if (status === 'ended' || today > endsOn) return 'finished'
  if (today < startsOn) return 'upcoming'
  return 'running'
}
