import { addDays, daysBetween } from '@/lib/time'
import type { SubjectCode } from '@/types/questions'

/**
 * Deterministic study planner (SYSTEM_ARCHITECTURE §11). Pure: same input + same `today` → same
 * plan. No I/O, no randomness, no clock reads. Unit-tested in tests/unit/planner.test.ts.
 *
 * Rules
 * - Horizon: study days from `today` up to the day BEFORE the exam (never on/after the exam date).
 *   No exam date (or one that has passed) → 56 days. At least 7 days unless the exam is sooner.
 *   Capped at 120 days (regenerate later).
 * - Domain weight = max(1 − accuracy, 0.1) × official share (weight_percent / 100) × subject factor.
 *   Unknown accuracy = 0.5. Subjects outside a non-empty preference keep a 0.35 maintenance factor.
 * - Regular day: weekly review (every 7th day), at most one lesson (incomplete published lesson,
 *   weakest areas first, lesson duration), then practice blocks of 15–25 min until the daily budget
 *   is used. Blocks go to domains/skills by smooth weighted round-robin, so minutes are proportional
 *   to weight. A budget under 15 min gets one short block.
 * - Mock exams: in the final 6 weeks, one every 14 days (38, 24 and 10 days before the exam; the
 *   plan end stands in for the exam when no date is set). Only when a published mock exam exists.
 *   A mock day holds only the mock (its length can exceed the daily budget).
 * - Final 3 days before a real exam date: light review only.
 */

export type TaskType = 'lesson' | 'practice' | 'review' | 'mock_exam'

export const PLANNER = {
  DEFAULT_HORIZON_DAYS: 56,
  MIN_HORIZON_DAYS: 7,
  MAX_HORIZON_DAYS: 120,
  UNKNOWN_ACCURACY: 0.5,
  MIN_NEED: 0.1,
  NON_PREFERRED_FACTOR: 0.35,
  BLOCK_MIN: 15,
  BLOCK_MAX: 25,
  MOCK_WINDOW_DAYS: 42,
  MOCK_DAYS_BEFORE_EXAM: [38, 24, 10] as const,
  LIGHT_REVIEW_DAYS: 3,
  REVIEW_EVERY_DAYS: 7,
  LESSON_MIN_MINUTES: 5,
  LESSON_MAX_MINUTES: 90,
  MOCK_DEFAULT_MINUTES: 134,
  SKILL_MIN_ANSWERS: 3,
  DOMAIN_MIN_ANSWERS: 5,
} as const

export type PlannerSubject = { id: string; code: SubjectCode }
export type PlannerDomain = { id: string; subjectId: string; name: string; weightPercent: number; position: number }
export type PlannerSkill = { id: string; domainId: string; name: string; position: number }
export type PlannerLesson = { id: string; skillId: string; title: string; durationSeconds: number; order: number }
export type PlannerPracticeSet = { id: string; title: string; subjectId: string; domainId: string | null; skillId: string | null }
export type PlannerMockExam = { id: string; title: string; minutes: number }
export type AnswerStat = { answered: number; correct: number }

export type PlannerInput = {
  examDate: string | null
  dailyMinutes: number
  preferredSubjects: SubjectCode[]
  subjects: PlannerSubject[]
  domains: PlannerDomain[]
  skills: PlannerSkill[]
  /** Combined accuracy per domain (see combineDomainAccuracy); missing/null = unknown. */
  domainAccuracy: Record<string, number | null>
  skillStats: Record<string, AnswerStat>
  /** Published lessons the student has NOT completed. */
  lessons: PlannerLesson[]
  practiceSets: PlannerPracticeSet[]
  mockExams: PlannerMockExam[]
}

export type PlannedTask = {
  date: string
  type: TaskType
  title: string
  description: string
  subjectId: string | null
  domainId: string | null
  skillId: string | null
  lessonId: string | null
  practiceSetId: string | null
  mockExamId: string | null
  minutes: number
  position: number
}

export type DomainAllocation = {
  domainId: string
  name: string
  subjectCode: SubjectCode
  accuracy: number | null
  weight: number
  practiceMinutes: number
}

export type PlanSummary = {
  startDate: string
  endDate: string
  days: number
  examDate: string | null
  horizonSource: 'exam_date' | 'default'
  examDatePassed: boolean
  capped: boolean
  dailyMinutes: number
  totalMinutes: number
  minutesBySubject: Record<SubjectCode, number>
  minutesByType: Record<TaskType, number>
  taskCounts: Record<TaskType, number>
  domains: DomainAllocation[]
  focusSkills: { skillId: string; name: string; accuracy: number | null }[]
  mockExamDates: string[]
  lightReviewDates: string[]
}

export type StudyPlanResult = { startDate: string; endDate: string; tasks: PlannedTask[]; summary: PlanSummary }

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * Domain accuracy from all scored answers (skill_performance, which already includes diagnostic
 * answers) when there are at least `minAnswers`; otherwise the latest diagnostic result; otherwise
 * whatever little practice data exists; otherwise null (unknown).
 */
export function combineDomainAccuracy(
  domainIds: string[],
  diagnostic: Record<string, { correct: number; total: number }>,
  performance: Record<string, AnswerStat>,
  minAnswers: number = PLANNER.DOMAIN_MIN_ANSWERS,
): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  for (const id of domainIds) {
    const perf = performance[id]
    const diag = diagnostic[id]
    if (perf && perf.answered >= minAnswers) out[id] = perf.correct / perf.answered
    else if (diag && diag.total > 0) out[id] = diag.correct / diag.total
    else if (perf && perf.answered > 0) out[id] = perf.correct / perf.answered
    else out[id] = null
  }
  return out
}

export function planHorizon(
  examDate: string | null,
  today: string,
): { days: number; source: 'exam_date' | 'default'; examDate: string | null; examDatePassed: boolean; capped: boolean } {
  const valid = examDate && /^\d{4}-\d{2}-\d{2}$/.test(examDate) ? examDate : null
  if (valid && valid > today) {
    const toExam = daysBetween(today, valid)
    const days = Math.min(toExam, PLANNER.MAX_HORIZON_DAYS)
    return { days, source: 'exam_date', examDate: valid, examDatePassed: false, capped: toExam > PLANNER.MAX_HORIZON_DAYS }
  }
  return {
    days: Math.max(PLANNER.MIN_HORIZON_DAYS, PLANNER.DEFAULT_HORIZON_DAYS),
    source: 'default',
    examDate: null,
    examDatePassed: Boolean(valid),
    capped: false,
  }
}

/** Split a budget into blocks of 15–25 minutes (as many as fit). */
export function splitPracticeBlocks(minutes: number): number[] {
  if (minutes < PLANNER.BLOCK_MIN) return []
  let n = Math.ceil(minutes / PLANNER.BLOCK_MAX)
  while (n > 1 && Math.floor(minutes / n) < PLANNER.BLOCK_MIN) n--
  const size = Math.min(PLANNER.BLOCK_MAX, Math.floor(minutes / n))
  return Array.from({ length: n }, () => size)
}

export function lessonMinutes(durationSeconds: number): number {
  return Math.min(PLANNER.LESSON_MAX_MINUTES, Math.max(PLANNER.LESSON_MIN_MINUTES, Math.ceil(durationSeconds / 60)))
}

/** Smooth weighted round-robin: deterministic, proportional picks. */
class WeightedPicker {
  private credit = new Map<string, number>()
  private readonly total: number
  constructor(private readonly items: { id: string; weight: number }[]) {
    this.total = items.reduce((s, i) => s + i.weight, 0)
    for (const i of items) this.credit.set(i.id, 0)
  }
  get size() {
    return this.items.length
  }
  next(): string | null {
    if (this.items.length === 0 || this.total <= 0) return null
    let best: { id: string; weight: number } | null = null
    for (const item of this.items) {
      const c = this.credit.get(item.id)! + item.weight
      this.credit.set(item.id, c)
      if (!best || c > this.credit.get(best.id)!) best = item
    }
    this.credit.set(best!.id, this.credit.get(best!.id)! - this.total)
    return best!.id
  }
}

const round3 = (n: number) => Math.round(n * 1000) / 1000
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

export function buildStudyPlan(input: PlannerInput, today: string): StudyPlanResult {
  const daily = Math.max(10, Math.min(600, Math.round(input.dailyMinutes || 60)))
  const horizon = planHorizon(input.examDate, today)
  const startDate = today
  const endDate = addDays(today, horizon.days - 1)
  // Anchor for mock cadence and "final days": the real exam, or the day after the plan ends.
  const anchor = horizon.examDate ?? addDays(endDate, 1)
  const realExam = horizon.examDate !== null

  const subjectById = new Map(input.subjects.map((s) => [s.id, s]))
  const preferred = new Set(input.preferredSubjects)
  const subjectFactor = (subjectId: string) => {
    const code = subjectById.get(subjectId)?.code
    if (preferred.size === 0 || !code) return 1
    return preferred.has(code) ? 1 : PLANNER.NON_PREFERRED_FACTOR
  }

  const domains = [...input.domains]
    .filter((d) => subjectById.has(d.subjectId))
    .sort((a, b) => cmp(subjectById.get(a.subjectId)!.code, subjectById.get(b.subjectId)!.code) || a.position - b.position || cmp(a.id, b.id))
  const domainAcc = (id: string) => input.domainAccuracy[id] ?? null
  const domainWeight = new Map(
    domains.map((d) => {
      const acc = domainAcc(d.id) ?? PLANNER.UNKNOWN_ACCURACY
      const need = Math.max(1 - acc, PLANNER.MIN_NEED)
      return [d.id, need * (Math.max(0, d.weightPercent) / 100) * subjectFactor(d.subjectId)]
    }),
  )

  const skillsByDomain = new Map<string, PlannerSkill[]>()
  for (const s of [...input.skills].sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1))) {
    if (!skillsByDomain.has(s.domainId)) skillsByDomain.set(s.domainId, [])
    skillsByDomain.get(s.domainId)!.push(s)
  }
  const skillAccuracy = (skill: PlannerSkill): number | null => {
    const stat = input.skillStats[skill.id]
    if (stat && stat.answered >= PLANNER.SKILL_MIN_ANSWERS) return stat.correct / stat.answered
    return null
  }
  const skillNeed = (skill: PlannerSkill) =>
    Math.max(1 - (skillAccuracy(skill) ?? domainAcc(skill.domainId) ?? PLANNER.UNKNOWN_ACCURACY), PLANNER.MIN_NEED)

  const practiceDomains = domains.filter((d) => (skillsByDomain.get(d.id)?.length ?? 0) > 0 && domainWeight.get(d.id)! > 0)
  const domainPicker = new WeightedPicker(practiceDomains.map((d) => ({ id: d.id, weight: domainWeight.get(d.id)! })))
  const skillPickers = new Map(
    practiceDomains.map((d) => [d.id, new WeightedPicker(skillsByDomain.get(d.id)!.map((s) => ({ id: s.id, weight: skillNeed(s) })))]),
  )
  const skillById = new Map(input.skills.map((s) => [s.id, s]))
  const domainById = new Map(domains.map((d) => [d.id, d]))

  // Lessons: weakest areas first, then course order.
  const lessonQueue = input.lessons
    .filter((l) => skillById.has(l.skillId) && domainById.has(skillById.get(l.skillId)!.domainId))
    .map((l) => {
      const skill = skillById.get(l.skillId)!
      return { lesson: l, priority: domainWeight.get(skill.domainId)! * skillNeed(skill) }
    })
    .sort((a, b) => b.priority - a.priority || a.lesson.order - b.lesson.order || (a.lesson.id < b.lesson.id ? -1 : 1))
    .map((x) => x.lesson)

  const setUse = new Map<string, number>()
  const practiceSetFor = (skill: PlannerSkill): PlannerPracticeSet | null => {
    const domain = domainById.get(skill.domainId)!
    const candidates = input.practiceSets
      .filter((s) => s.skillId === skill.id || (s.skillId === null && s.domainId === domain.id))
      .sort((a, b) => (a.skillId === skill.id ? 0 : 1) - (b.skillId === skill.id ? 0 : 1) || (a.id < b.id ? -1 : 1))
    if (candidates.length === 0) return null
    const used = setUse.get(skill.id) ?? 0
    setUse.set(skill.id, used + 1)
    return candidates[used % candidates.length]!
  }

  const mocks = [...input.mockExams].sort((a, b) => (a.id < b.id ? -1 : 1))
  const mockDaysUntil = new Set<number>(PLANNER.MOCK_DAYS_BEFORE_EXAM.filter((d) => d <= PLANNER.MOCK_WINDOW_DAYS))

  const tasks: PlannedTask[] = []
  const mockExamDates: string[] = []
  const lightReviewDates: string[] = []
  const practiceMinutesByDomain = new Map<string, number>()
  let mockIndex = 0

  const base = { subjectId: null, domainId: null, skillId: null, lessonId: null, practiceSetId: null, mockExamId: null }

  for (let i = 0; i < horizon.days; i++) {
    const date = addDays(startDate, i)
    const untilAnchor = daysBetween(date, anchor)
    if (realExam && date >= anchor) break // defensive: never on/after the exam

    // Final days: light review only.
    if (realExam && untilAnchor <= PLANNER.LIGHT_REVIEW_DAYS) {
      lightReviewDates.push(date)
      tasks.push({
        ...base,
        date,
        type: 'review',
        title: untilAnchor === 1 ? 'Rest and quick review' : 'Light review: mistakes and key formulas',
        description:
          untilAnchor === 1
            ? 'Skim your notes and get a good night’s sleep. No new material.'
            : 'Re-read explanations of questions you missed and the formulas you need. No new material.',
        minutes: Math.max(5, Math.min(daily, untilAnchor === 1 ? 20 : 30)),
        position: 0,
      })
      continue
    }

    // Mock exam days.
    if (mocks.length > 0 && mockDaysUntil.has(untilAnchor)) {
      const exam = mocks[mockIndex % mocks.length]!
      mockIndex++
      mockExamDates.push(date)
      tasks.push({
        ...base,
        date,
        type: 'mock_exam',
        title: exam.title,
        description: 'Full-length timed mock exam. Review every incorrect answer afterwards.',
        mockExamId: exam.id,
        minutes: Math.max(5, Math.min(240, Math.round(exam.minutes || PLANNER.MOCK_DEFAULT_MINUTES))),
        position: 0,
      })
      continue
    }

    // Regular day.
    let remaining = daily
    let position = 0
    const dayTasks: PlannedTask[] = []

    if (i % PLANNER.REVIEW_EVERY_DAYS === PLANNER.REVIEW_EVERY_DAYS - 1) {
      const minutes = daily >= 40 ? 20 : Math.min(daily, PLANNER.BLOCK_MIN)
      dayTasks.push({
        ...base,
        date,
        type: 'review',
        title: 'Review incorrect answers',
        description: 'Go back through this week’s incorrect answers and read each explanation.',
        minutes,
        position: position++,
      })
      remaining -= minutes
    }

    const lessonIdx = lessonQueue.findIndex((l) => lessonMinutes(l.durationSeconds) <= remaining)
    if (lessonIdx >= 0 && remaining >= PLANNER.LESSON_MIN_MINUTES) {
      const lesson = lessonQueue.splice(lessonIdx, 1)[0]!
      const skill = skillById.get(lesson.skillId)!
      const domain = domainById.get(skill.domainId)!
      const minutes = lessonMinutes(lesson.durationSeconds)
      dayTasks.push({
        ...base,
        date,
        type: 'lesson',
        title: lesson.title.slice(0, 200),
        description: `Lesson for ${skill.name}.`,
        subjectId: domain.subjectId,
        domainId: domain.id,
        skillId: skill.id,
        lessonId: lesson.id,
        minutes,
        position: position++,
      })
      remaining -= minutes
    }

    let blocks = splitPracticeBlocks(remaining)
    if (blocks.length === 0 && dayTasks.length === 0 && remaining >= 5) blocks = [remaining]
    for (const minutes of blocks) {
      const domainId = domainPicker.next()
      if (!domainId) break
      const skillId = skillPickers.get(domainId)!.next()!
      const skill = skillById.get(skillId)!
      const domain = domainById.get(domainId)!
      const set = practiceSetFor(skill)
      dayTasks.push({
        ...base,
        date,
        type: 'practice',
        title: `Practice: ${skill.name}`.slice(0, 200),
        description: set ? `Suggested set: ${set.title}` : `Mixed questions on ${skill.name}.`,
        subjectId: domain.subjectId,
        domainId,
        skillId,
        practiceSetId: set?.id ?? null,
        minutes,
        position: position++,
      })
      practiceMinutesByDomain.set(domainId, (practiceMinutesByDomain.get(domainId) ?? 0) + minutes)
    }
    tasks.push(...dayTasks)
  }

  // Summary -----------------------------------------------------------------
  const minutesBySubject: Record<SubjectCode, number> = { math: 0, reading_writing: 0 }
  const minutesByType: Record<TaskType, number> = { lesson: 0, practice: 0, review: 0, mock_exam: 0 }
  const taskCounts: Record<TaskType, number> = { lesson: 0, practice: 0, review: 0, mock_exam: 0 }
  for (const t of tasks) {
    minutesByType[t.type] += t.minutes
    taskCounts[t.type] += 1
    const code = t.subjectId ? subjectById.get(t.subjectId)?.code : undefined
    if (code) minutesBySubject[code] += t.minutes
  }
  const domainSummary: DomainAllocation[] = domains
    .map((d) => ({
      domainId: d.id,
      name: d.name,
      subjectCode: subjectById.get(d.subjectId)!.code,
      accuracy: domainAcc(d.id) === null ? null : round3(domainAcc(d.id)!),
      weight: round3(domainWeight.get(d.id)!),
      practiceMinutes: practiceMinutesByDomain.get(d.id) ?? 0,
    }))
    .sort((a, b) => b.weight - a.weight || (a.domainId < b.domainId ? -1 : 1))
  const focusSkills = input.skills
    .filter((s) => domainById.has(s.domainId))
    .map((s) => ({ skillId: s.id, name: s.name, accuracy: skillAccuracy(s), need: skillNeed(s) * domainWeight.get(s.domainId)! }))
    .sort((a, b) => b.need - a.need || (a.skillId < b.skillId ? -1 : 1))
    .slice(0, 5)
    .map(({ skillId, name, accuracy }) => ({ skillId, name, accuracy: accuracy === null ? null : round3(accuracy) }))

  return {
    startDate,
    endDate,
    tasks,
    summary: {
      startDate,
      endDate,
      days: horizon.days,
      examDate: horizon.examDate,
      horizonSource: horizon.source,
      examDatePassed: horizon.examDatePassed,
      capped: horizon.capped,
      dailyMinutes: daily,
      totalMinutes: tasks.reduce((s, t) => s + t.minutes, 0),
      minutesBySubject,
      minutesByType,
      taskCounts,
      domains: domainSummary,
      focusSkills,
      mockExamDates,
      lightReviewDates,
    },
  }
}
