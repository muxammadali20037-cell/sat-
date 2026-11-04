/**
 * Pure helpers for the dashboard's "today" layer (unit-tested, no I/O):
 *   - the daily mission: today's study-plan tasks, or a short rule-based list built from the
 *     student's own state (diagnostic, weakest skill, lesson in progress, mistakes, daily minutes);
 *   - the eight-domain mastery map;
 *   - this week's activity and weekly goal.
 *
 * Every number here comes from the student's own records. Nothing is invented: an item whose
 * input is missing (no lessons published, no questions published, no daily goal set) is omitted.
 */
import { levelFromAccuracy, type LevelBand } from '@/lib/scoring'
import { addDays } from '@/lib/time'
import type { Tally } from '@/features/analytics/aggregate'
import { isActiveDay } from './logic'

// ---------------------------------------------------------------------------
// Daily mission
// ---------------------------------------------------------------------------

export type MissionProgress = { value: number; target: number }

export type MissionItem =
  | { kind: 'diagnostic'; href: string; done: boolean }
  | {
      kind: 'plan_task'
      id: string
      taskType: 'lesson' | 'practice' | 'review' | 'mock_exam' | 'diagnostic'
      title: string
      minutes: number
      href: string
      done: boolean
    }
  | { kind: 'practice'; skillName: string; href: string; progress: MissionProgress; done: boolean }
  | { kind: 'lesson'; lessonTitle: string; resume: boolean; href: string; done: boolean }
  | { kind: 'mistakes'; count: number; href: string; done: boolean }
  /** Teacher-set work that is not submitted yet (nearest due first); `more` = the rest. */
  | { kind: 'class_work'; title: string; personal: boolean; more: number; href: string; done: boolean }
  /** A class lesson today that has not ended (time already formatted for the student). */
  | { kind: 'class_lesson'; title: string; time: string; group: string; href: string; done: boolean }
  | { kind: 'minutes'; progress: MissionProgress; done: boolean }

export type TodayActivity = { studySeconds: number; questionsAnswered: number; lessonsCompleted: number }

export type MissionInput = {
  planTasks: Array<{
    id: string
    type: 'lesson' | 'practice' | 'review' | 'mock_exam' | 'diagnostic'
    title: string
    minutes: number
    status: 'pending' | 'completed' | 'skipped'
    href: string
  }>
  hasCompletedDiagnostic: boolean
  diagnosticToday: boolean
  /** Published questions exist, so practice and the diagnostic can actually start. */
  questionsAvailable: boolean
  focusSkill: { name: string; href: string } | null
  lesson: { title: string; resume: boolean; href: string } | null
  mistakes: { count: number; href: string } | null
  retryCompletedToday: boolean
  /** Open class assignments, already ordered (personal and nearest due first). */
  classWork?: Array<{ id: string; title: string; personal: boolean }>
  /** Today's remaining class lessons, earliest first. */
  classLessons?: Array<{ title: string; time: string; group: string }>
  today: TodayActivity
  dailyStudyMinutes: number | null
}

export const MISSION_QUESTION_TARGET = 10
export const MISSION_MAX_ITEMS = 4

export type Mission = { source: 'plan' | 'rules'; items: MissionItem[]; done: number; total: number }

export function buildMission(input: MissionInput): Mission {
  const items: MissionItem[] = []
  const minutesItem = (): MissionItem | null => {
    if (!input.dailyStudyMinutes || input.dailyStudyMinutes <= 0) return null
    const value = Math.floor(input.today.studySeconds / 60)
    return { kind: 'minutes', progress: { value, target: input.dailyStudyMinutes }, done: value >= input.dailyStudyMinutes }
  }

  const work = input.classWork ?? []
  const classItem: MissionItem | null = work[0]
    ? { kind: 'class_work', title: work[0].title, personal: work[0].personal, more: work.length - 1, href: `/dashboard/classes/${work[0].id}`, done: false }
    : null

  const lesson = input.classLessons?.[0]
  const lessonItem: MissionItem | null = lesson ? { kind: 'class_lesson', title: lesson.title, time: lesson.time, group: lesson.group, href: '/dashboard/classes', done: false } : null

  const plan = input.planTasks.filter((t) => t.status !== 'skipped')
  if (plan.length > 0) {
    // A lesson today and work a teacher set come first: the plan does not know about them.
    if (lessonItem) items.push(lessonItem)
    if (classItem) items.push(classItem)
    for (const t of plan) {
      items.push({ kind: 'plan_task', id: t.id, taskType: t.type, title: t.title, minutes: t.minutes, href: t.href, done: t.status === 'completed' })
    }
    const m = minutesItem()
    if (m) items.push(m)
    return summarize('plan', items)
  }

  if (lessonItem) items.push(lessonItem)
  if (classItem) items.push(classItem)
  if (!input.hasCompletedDiagnostic || input.diagnosticToday) {
    if (input.questionsAvailable) items.push({ kind: 'diagnostic', href: '/dashboard/diagnostic', done: input.diagnosticToday })
  }
  if (input.mistakes && input.mistakes.count > 0) {
    items.push({ kind: 'mistakes', count: input.mistakes.count, href: input.mistakes.href, done: input.retryCompletedToday })
  }
  if (input.questionsAvailable && input.focusSkill) {
    const value = input.today.questionsAnswered
    items.push({
      kind: 'practice',
      skillName: input.focusSkill.name,
      href: input.focusSkill.href,
      progress: { value, target: MISSION_QUESTION_TARGET },
      done: value >= MISSION_QUESTION_TARGET,
    })
  }
  if (input.lesson) {
    items.push({ kind: 'lesson', lessonTitle: input.lesson.title, resume: input.lesson.resume, href: input.lesson.href, done: input.today.lessonsCompleted > 0 })
  }
  const m = minutesItem()
  // The minutes goal is the one item every student can do, so it is kept when the list is full.
  const capped = items.slice(0, m ? MISSION_MAX_ITEMS - 1 : MISSION_MAX_ITEMS)
  if (m) capped.push(m)
  return summarize('rules', capped)
}

function summarize(source: Mission['source'], items: MissionItem[]): Mission {
  return { source, items, done: items.filter((i) => i.done).length, total: items.length }
}

// ---------------------------------------------------------------------------
// Mastery map (8 Digital SAT domains)
// ---------------------------------------------------------------------------

/** Below this many scored answers a domain shows "not enough data" instead of a level. */
export const MASTERY_MIN_ANSWERS = 5

export type MasteryLevel = LevelBand | 'not_started' | 'too_few'

export function masteryLevel(scored: Tally): MasteryLevel {
  if (scored.answered === 0 || scored.accuracy === null) return 'not_started'
  if (scored.answered < MASTERY_MIN_ANSWERS) return 'too_few'
  return levelFromAccuracy(scored.accuracy)
}

export type MasteryDomain = {
  id: string
  name: string
  subjectCode: 'math' | 'reading_writing'
  weightPercent: number
  scored: Tally
  level: MasteryLevel
  lessonsTotal: number
  lessonsCompleted: number
  href: string
}

// ---------------------------------------------------------------------------
// Week
// ---------------------------------------------------------------------------

export type WeekActivityRow = { activity_date: string; study_seconds: number; questions_answered: number; lessons_completed: number }

export type WeekBar = { date: string; minutes: number; questions: number; active: boolean; isToday: boolean; isFuture: boolean }

export type WeekSummary = {
  days: WeekBar[]
  totalMinutes: number
  totalQuestions: number
  activeDays: number
  /** dailyStudyMinutes × 7 from onboarding/settings; null when the student has not set it. */
  goalMinutes: number | null
}

export function weekSummary(today: string, rows: WeekActivityRow[], dailyStudyMinutes: number | null): WeekSummary {
  const byDate = new Map(rows.map((r) => [r.activity_date, r]))
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay() // 0 = Sunday
  const monday = addDays(today, -((dow + 6) % 7))
  const days: WeekBar[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i)
    const r = byDate.get(date)
    return {
      date,
      minutes: r ? Math.floor(r.study_seconds / 60) : 0,
      questions: r?.questions_answered ?? 0,
      active: r ? isActiveDay(r) : false,
      isToday: date === today,
      isFuture: date > today,
    }
  })
  return {
    days,
    totalMinutes: days.reduce((s, d) => s + d.minutes, 0),
    totalQuestions: days.reduce((s, d) => s + d.questions, 0),
    activeDays: days.filter((d) => d.active).length,
    goalMinutes: dailyStudyMinutes && dailyStudyMinutes > 0 ? dailyStudyMinutes * 7 : null,
  }
}

export function todayActivity(today: string, rows: WeekActivityRow[]): TodayActivity {
  const r = rows.find((row) => row.activity_date === today)
  return { studySeconds: r?.study_seconds ?? 0, questionsAnswered: r?.questions_answered ?? 0, lessonsCompleted: r?.lessons_completed ?? 0 }
}

// ---------------------------------------------------------------------------
// Recent mistakes
// ---------------------------------------------------------------------------

export type MistakeRow = { question_id: string; attempt_id: string; answered_at: string; kind: string }

/** Latest wrong answer per question, newest first, skipping questions locked by a running timed test. */
export function latestMistakes(rows: MistakeRow[], locked: Set<string>, limit: number): MistakeRow[] {
  const seen = new Set<string>()
  const out: MistakeRow[] = []
  for (const r of [...rows].sort((a, b) => b.answered_at.localeCompare(a.answered_at))) {
    if (seen.has(r.question_id) || locked.has(r.question_id)) continue
    seen.add(r.question_id)
    out.push(r)
    if (out.length >= limit) break
  }
  return out
}
