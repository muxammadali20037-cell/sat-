import { describe, expect, it } from 'vitest'
import {
  buildStudyPlan,
  combineDomainAccuracy,
  lessonMinutes,
  planHorizon,
  PLANNER,
  splitPracticeBlocks,
  type PlannerInput,
  type PlannedTask,
} from '@/features/study-plan/planner'
import { addDays, daysBetween } from '@/lib/time'

const TODAY = '2026-11-02'

function fixture(over: Partial<PlannerInput> = {}): PlannerInput {
  const subjects = [
    { id: 'm', code: 'math' as const },
    { id: 'rw', code: 'reading_writing' as const },
  ]
  const domains = [
    { id: 'alg', subjectId: 'm', name: 'Algebra', weightPercent: 35, position: 1 },
    { id: 'adv', subjectId: 'm', name: 'Advanced Math', weightPercent: 35, position: 2 },
    { id: 'psda', subjectId: 'm', name: 'Problem-Solving', weightPercent: 15, position: 3 },
    { id: 'geo', subjectId: 'm', name: 'Geometry', weightPercent: 15, position: 4 },
    { id: 'cs', subjectId: 'rw', name: 'Craft and Structure', weightPercent: 28, position: 1 },
    { id: 'ii', subjectId: 'rw', name: 'Information and Ideas', weightPercent: 26, position: 2 },
    { id: 'sec', subjectId: 'rw', name: 'Standard English Conventions', weightPercent: 26, position: 3 },
    { id: 'eoi', subjectId: 'rw', name: 'Expression of Ideas', weightPercent: 20, position: 4 },
  ]
  const skills = domains.flatMap((d) => [1, 2].map((n) => ({ id: `${d.id}-s${n}`, domainId: d.id, name: `${d.name} skill ${n}`, position: n })))
  return {
    examDate: null,
    dailyMinutes: 60,
    preferredSubjects: [],
    subjects,
    domains,
    skills,
    domainAccuracy: {},
    skillStats: {},
    lessons: [],
    practiceSets: [],
    mockExams: [{ id: 'mock1', title: 'Mock exam 1', minutes: 134 }],
    ...over,
  }
}

const sumBy = (tasks: PlannedTask[], key: (t: PlannedTask) => string | null) => {
  const out: Record<string, number> = {}
  for (const t of tasks) {
    const k = key(t)
    if (k) out[k] = (out[k] ?? 0) + t.minutes
  }
  return out
}
const byDate = (tasks: PlannedTask[]) => {
  const out = new Map<string, PlannedTask[]>()
  for (const t of tasks) out.set(t.date, [...(out.get(t.date) ?? []), t])
  return out
}

describe('horizon', () => {
  it('defaults to 56 days without an exam date', () => {
    const plan = buildStudyPlan(fixture(), TODAY)
    expect(plan.summary.horizonSource).toBe('default')
    expect(plan.summary.days).toBe(56)
    expect(plan.startDate).toBe(TODAY)
    expect(plan.endDate).toBe(addDays(TODAY, 55))
    expect(PLANNER.DEFAULT_HORIZON_DAYS).toBeGreaterThanOrEqual(PLANNER.MIN_HORIZON_DAYS)
  })
  it('runs until the day before the exam', () => {
    const exam = addDays(TODAY, 30)
    const plan = buildStudyPlan(fixture({ examDate: exam }), TODAY)
    expect(plan.summary.horizonSource).toBe('exam_date')
    expect(plan.endDate).toBe(addDays(exam, -1))
    expect(Math.max(...plan.tasks.map((t) => daysBetween(t.date, exam)))).toBe(30)
  })
  it('never schedules on or after the exam date, even when the exam is close', () => {
    for (const d of [1, 2, 3, 5, 9, 40, 70]) {
      const exam = addDays(TODAY, d)
      const plan = buildStudyPlan(fixture({ examDate: exam }), TODAY)
      expect(plan.tasks.length).toBeGreaterThan(0)
      expect(plan.tasks.every((t) => t.date < exam && t.date >= TODAY)).toBe(true)
    }
  })
  it('treats a past exam date as unset and flags it', () => {
    const h = planHorizon(addDays(TODAY, -3), TODAY)
    expect(h).toMatchObject({ source: 'default', examDatePassed: true, days: 56 })
    expect(planHorizon(TODAY, TODAY).source).toBe('default')
  })
  it('caps very distant exams', () => {
    const h = planHorizon(addDays(TODAY, 400), TODAY)
    expect(h.days).toBe(PLANNER.MAX_HORIZON_DAYS)
    expect(h.capped).toBe(true)
  })
})

describe('allocation', () => {
  it('gives weak, heavily weighted domains more practice time', () => {
    const plan = buildStudyPlan(
      fixture({ domainAccuracy: { alg: 0.3, adv: 0.9, psda: 0.5, geo: 0.5, cs: 0.5, ii: 0.5, sec: 0.5, eoi: 0.5 } }),
      TODAY,
    )
    const practice = sumBy(plan.tasks.filter((t) => t.type === 'practice'), (t) => t.domainId)
    // weights: alg 0.7×0.35=0.245, adv 0.1×0.35=0.035
    expect(practice.alg!).toBeGreaterThan(practice.adv! * 4)
    expect(plan.summary.domains[0]!.domainId).toBe('alg')
  })
  it('allocates in proportion to (1 − accuracy) × official share', () => {
    const plan = buildStudyPlan(fixture({ dailyMinutes: 100 }), TODAY) // all unknown → 0.5 × share
    const practice = sumBy(plan.tasks.filter((t) => t.type === 'practice'), (t) => t.domainId)
    const total = Object.values(practice).reduce((a, b) => a + b, 0)
    // shares: alg 35/200 = 17.5%, psda 15/200 = 7.5%
    expect(practice.alg! / total).toBeCloseTo(0.175, 1)
    expect(practice.psda! / total).toBeCloseTo(0.075, 1)
  })
  it('treats unknown accuracy as 50%', () => {
    const known = buildStudyPlan(fixture({ domainAccuracy: Object.fromEntries(fixture().domains.map((d) => [d.id, 0.5])) }), TODAY)
    const unknown = buildStudyPlan(fixture(), TODAY)
    expect(known.summary.domains.map((d) => d.weight)).toEqual(unknown.summary.domains.map((d) => d.weight))
  })
  it('keeps a maintenance share for non-preferred subjects', () => {
    const plan = buildStudyPlan(fixture({ preferredSubjects: ['math'] }), TODAY)
    const bySubject = plan.summary.minutesBySubject
    expect(bySubject.math).toBeGreaterThan(bySubject.reading_writing * 2)
    expect(bySubject.reading_writing).toBeGreaterThan(0)
  })
  it('combines domain accuracy: practice data first, then diagnostic, else unknown', () => {
    const acc = combineDomainAccuracy(
      ['a', 'b', 'c', 'd'],
      { a: { correct: 1, total: 2 }, b: { correct: 2, total: 2 } },
      { a: { answered: 10, correct: 8 }, b: { answered: 2, correct: 0 }, c: { answered: 2, correct: 1 } },
    )
    expect(acc).toEqual({ a: 0.8, b: 1, c: 0.5, d: null })
  })
})

describe('daily minutes budget', () => {
  for (const daily of [10, 20, 30, 45, 60, 90, 120]) {
    it(`fits ${daily} min/day (except mock days) with 15–25 min practice blocks`, () => {
      const plan = buildStudyPlan(
        fixture({
          dailyMinutes: daily,
          lessons: [
            { id: 'l1', skillId: 'alg-s1', title: 'Linear equations', durationSeconds: 12 * 60, order: 1 },
            { id: 'l2', skillId: 'cs-s1', title: 'Words in context', durationSeconds: 25 * 60, order: 2 },
            { id: 'l3', skillId: 'geo-s1', title: 'Circles', durationSeconds: 100 * 60, order: 3 },
          ],
        }),
        TODAY,
      )
      for (const [, tasks] of byDate(plan.tasks)) {
        if (tasks.some((t) => t.type === 'mock_exam')) {
          expect(tasks).toHaveLength(1)
          continue
        }
        expect(tasks.reduce((s, t) => s + t.minutes, 0)).toBeLessThanOrEqual(daily)
        expect(tasks.map((t) => t.position)).toEqual(tasks.map((_, i) => i))
        for (const t of tasks.filter((x) => x.type === 'practice')) {
          if (daily >= PLANNER.BLOCK_MIN) {
            expect(t.minutes).toBeGreaterThanOrEqual(PLANNER.BLOCK_MIN)
            expect(t.minutes).toBeLessThanOrEqual(PLANNER.BLOCK_MAX)
          } else {
            expect(t.minutes).toBe(daily)
          }
        }
      }
    })
  }
  it('splits budgets into 15–25 minute blocks', () => {
    expect(splitPracticeBlocks(14)).toEqual([])
    expect(splitPracticeBlocks(15)).toEqual([15])
    expect(splitPracticeBlocks(26)).toEqual([25])
    expect(splitPracticeBlocks(40)).toEqual([20, 20])
    expect(splitPracticeBlocks(60)).toEqual([20, 20, 20])
    expect(splitPracticeBlocks(100)).toEqual([25, 25, 25, 25])
  })
  it('schedules each incomplete lesson once, by its duration, weakest areas first', () => {
    const plan = buildStudyPlan(
      fixture({
        domainAccuracy: { cs: 0.2, alg: 0.9 },
        lessons: [
          { id: 'l-alg', skillId: 'alg-s1', title: 'Algebra lesson', durationSeconds: 600, order: 1 },
          { id: 'l-cs', skillId: 'cs-s1', title: 'Craft lesson', durationSeconds: 840, order: 2 },
        ],
      }),
      TODAY,
    )
    const lessons = plan.tasks.filter((t) => t.type === 'lesson')
    expect(lessons.map((l) => l.lessonId)).toEqual(['l-cs', 'l-alg'])
    expect(lessons[0]!.minutes).toBe(14)
    expect(lessonMinutes(1)).toBe(PLANNER.LESSON_MIN_MINUTES)
  })
  it('adds a weekly review of incorrect answers', () => {
    const plan = buildStudyPlan(fixture(), TODAY)
    const reviews = plan.tasks.filter((t) => t.type === 'review').map((t) => daysBetween(TODAY, t.date))
    expect(reviews.slice(0, 3)).toEqual([6, 13, 20])
  })
})

describe('mock exams and final days', () => {
  it('schedules one mock every 14 days in the final 6 weeks (38, 24, 10 days out)', () => {
    const exam = addDays(TODAY, 60)
    const plan = buildStudyPlan(fixture({ examDate: exam }), TODAY)
    const mocks = plan.tasks.filter((t) => t.type === 'mock_exam')
    expect(mocks.map((m) => daysBetween(m.date, exam))).toEqual([38, 24, 10])
    expect(mocks.every((m) => m.mockExamId === 'mock1' && m.minutes === 134)).toBe(true)
    expect(plan.summary.mockExamDates).toHaveLength(3)
    for (let i = 1; i < mocks.length; i++) expect(daysBetween(mocks[i - 1]!.date, mocks[i]!.date)).toBe(14)
  })
  it('only schedules mocks inside the window and only if a published mock exists', () => {
    const exam = addDays(TODAY, 20)
    expect(buildStudyPlan(fixture({ examDate: exam }), TODAY).tasks.filter((t) => t.type === 'mock_exam').map((m) => daysBetween(m.date, exam))).toEqual([10])
    expect(buildStudyPlan(fixture({ examDate: exam, mockExams: [] }), TODAY).tasks.some((t) => t.type === 'mock_exam')).toBe(false)
  })
  it('uses the plan end as the anchor when there is no exam date', () => {
    const plan = buildStudyPlan(fixture(), TODAY)
    const anchor = addDays(plan.endDate, 1)
    expect(plan.tasks.filter((t) => t.type === 'mock_exam').map((m) => daysBetween(m.date, anchor))).toEqual([38, 24, 10])
    expect(plan.summary.lightReviewDates).toEqual([])
  })
  it('makes the last 3 days before the exam light review only', () => {
    const exam = addDays(TODAY, 21)
    const plan = buildStudyPlan(fixture({ examDate: exam, dailyMinutes: 120 }), TODAY)
    const last3 = plan.tasks.filter((t) => daysBetween(t.date, exam) <= 3)
    expect(last3).toHaveLength(3)
    expect(last3.every((t) => t.type === 'review' && t.minutes <= 30)).toBe(true)
    expect(plan.summary.lightReviewDates).toHaveLength(3)
  })
})

describe('determinism and summary', () => {
  it('returns identical plans for identical input', () => {
    const input = fixture({ examDate: addDays(TODAY, 45), domainAccuracy: { alg: 0.4, cs: 0.7 } })
    expect(buildStudyPlan(input, TODAY)).toEqual(buildStudyPlan(input, TODAY))
  })
  it('summary totals match the tasks', () => {
    const plan = buildStudyPlan(fixture({ examDate: addDays(TODAY, 50) }), TODAY)
    const total = plan.tasks.reduce((s, t) => s + t.minutes, 0)
    expect(plan.summary.totalMinutes).toBe(total)
    expect(Object.values(plan.summary.minutesByType).reduce((a, b) => a + b, 0)).toBe(total)
    expect(plan.summary.taskCounts.practice).toBe(plan.tasks.filter((t) => t.type === 'practice').length)
    expect(plan.tasks.every((t) => t.minutes >= 5 && t.minutes <= 240 && t.title.length <= 200)).toBe(true)
  })
})
