/**
 * Dashboard "today" layer: daily mission rules, mastery levels, the week strip and recent mistakes.
 * Every value must come from the student's own records; items without real input are omitted.
 */
import { describe, expect, it } from 'vitest'
import {
  buildMission,
  latestMistakes,
  masteryLevel,
  MISSION_MAX_ITEMS,
  todayActivity,
  weekSummary,
  type MissionInput,
} from '@/features/dashboard/today'
import { tally } from '@/features/analytics/aggregate'

const base: MissionInput = {
  planTasks: [],
  hasCompletedDiagnostic: true,
  diagnosticToday: false,
  questionsAvailable: true,
  focusSkill: { name: 'Linear equations', href: '/dashboard/practice?skill=x' },
  lesson: { title: 'Slope', resume: true, href: '/dashboard/lesson/1' },
  mistakes: null,
  retryCompletedToday: false,
  today: { studySeconds: 0, questionsAnswered: 0, lessonsCompleted: 0 },
  dailyStudyMinutes: 30,
}

describe('buildMission', () => {
  it('puts open class work first, in rules and plan modes, and counts the rest', () => {
    const classWork = [
      { id: 'a1', title: 'Algebra drill', personal: true },
      { id: 'a2', title: 'Essay', personal: false },
    ]
    const rules = buildMission({ ...base, classWork })
    expect(rules.items[0]).toEqual({ kind: 'class_work', title: 'Algebra drill', personal: true, more: 1, href: '/dashboard/classes/a1', done: false })
    const plan = buildMission({ ...base, classWork, planTasks: [{ id: 'p', type: 'lesson', title: 'L', minutes: 10, status: 'pending', href: '/l' }] })
    expect(plan.source).toBe('plan')
    expect(plan.items[0].kind).toBe('class_work')
    expect(buildMission({ ...base, classWork: [] }).items.some((i) => i.kind === 'class_work')).toBe(false)
  })

  it('uses today’s study-plan tasks when there are any (skipped ones dropped) plus the minutes goal', () => {
    const m = buildMission({
      ...base,
      planTasks: [
        { id: 'a', type: 'lesson', title: 'Watch: slope', minutes: 10, status: 'completed', href: '/l' },
        { id: 'b', type: 'practice', title: 'Practise slope', minutes: 15, status: 'pending', href: '/p' },
        { id: 'c', type: 'review', title: 'Skip me', minutes: 5, status: 'skipped', href: '/r' },
      ],
    })
    expect(m.source).toBe('plan')
    expect(m.items.map((i) => i.kind)).toEqual(['plan_task', 'plan_task', 'minutes'])
    expect(m.done).toBe(1)
    expect(m.total).toBe(3)
  })

  it('starts a new student with the diagnostic', () => {
    const m = buildMission({ ...base, hasCompletedDiagnostic: false, lesson: null })
    expect(m.source).toBe('rules')
    expect(m.items[0]).toMatchObject({ kind: 'diagnostic', done: false })
  })

  it('marks the diagnostic done when it was finished today', () => {
    const m = buildMission({ ...base, hasCompletedDiagnostic: true, diagnosticToday: true })
    expect(m.items[0]).toMatchObject({ kind: 'diagnostic', done: true })
  })

  it('tracks practice, lesson and minutes from today’s real activity', () => {
    const m = buildMission({ ...base, today: { studySeconds: 31 * 60, questionsAnswered: 12, lessonsCompleted: 0 } })
    const byKind = Object.fromEntries(m.items.map((i) => [i.kind, i]))
    expect(byKind.practice).toMatchObject({ done: true, progress: { value: 12, target: 10 } })
    expect(byKind.lesson).toMatchObject({ done: false, resume: true })
    expect(byKind.minutes).toMatchObject({ done: true, progress: { value: 31, target: 30 } })
    expect(m.done).toBe(2)
  })

  it('omits what has no real input: no questions published, no lessons, no daily goal', () => {
    const m = buildMission({ ...base, hasCompletedDiagnostic: false, questionsAvailable: false, lesson: null, dailyStudyMinutes: null })
    expect(m.items).toEqual([])
    expect(m.total).toBe(0)
  })

  it('caps the list and always keeps the minutes goal', () => {
    const m = buildMission({
      ...base,
      hasCompletedDiagnostic: false,
      mistakes: { count: 4, href: '/dashboard/results/1' },
    })
    expect(m.items).toHaveLength(MISSION_MAX_ITEMS)
    expect(m.items.at(-1)!.kind).toBe('minutes')
    expect(m.items.map((i) => i.kind)).toEqual(['diagnostic', 'mistakes', 'practice', 'minutes'])
  })

  it('counts mistakes as reviewed when a retry was finished today', () => {
    const m = buildMission({ ...base, mistakes: { count: 2, href: '/r' }, retryCompletedToday: true })
    expect(m.items.find((i) => i.kind === 'mistakes')).toMatchObject({ done: true, count: 2 })
  })
})

describe('masteryLevel', () => {
  it('needs enough answers before naming a level', () => {
    expect(masteryLevel(tally(0, 0))).toBe('not_started')
    expect(masteryLevel(tally(4, 4))).toBe('too_few')
  })
  it('uses the same bands as results (40/60/80%)', () => {
    expect(masteryLevel(tally(10, 3))).toBe('foundation')
    expect(masteryLevel(tally(10, 4))).toBe('developing')
    expect(masteryLevel(tally(10, 6))).toBe('proficient')
    expect(masteryLevel(tally(10, 8))).toBe('advanced')
  })
})

describe('weekSummary', () => {
  const rows = [
    { activity_date: '2026-11-02', study_seconds: 1800, questions_answered: 12, lessons_completed: 0 },
    { activity_date: '2026-11-03', study_seconds: 59, questions_answered: 0, lessons_completed: 0 },
    { activity_date: '2026-10-30', study_seconds: 3600, questions_answered: 40, lessons_completed: 1 }, // previous week
  ]
  it('builds Monday→Sunday for the current week with real minutes and questions', () => {
    const w = weekSummary('2026-11-03', rows, 20) // Tuesday
    expect(w.days.map((d) => d.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'])
    expect(w.days[0]).toMatchObject({ minutes: 30, questions: 12, active: true })
    expect(w.days[1]).toMatchObject({ minutes: 0, active: false, isToday: true })
    expect(w.days[2]!.isFuture).toBe(true)
    expect(w.totalMinutes).toBe(30)
    expect(w.totalQuestions).toBe(12)
    expect(w.activeDays).toBe(1)
    expect(w.goalMinutes).toBe(140)
  })
  it('has no goal when the student has not set a daily goal', () => {
    expect(weekSummary('2026-11-03', [], null).goalMinutes).toBeNull()
  })
  it('reads today’s activity', () => {
    expect(todayActivity('2026-11-02', rows)).toEqual({ studySeconds: 1800, questionsAnswered: 12, lessonsCompleted: 0 })
    expect(todayActivity('2026-11-05', rows)).toEqual({ studySeconds: 0, questionsAnswered: 0, lessonsCompleted: 0 })
  })
})

describe('latestMistakes', () => {
  it('keeps the newest wrong answer per question and skips questions of a running timed test', () => {
    const rows = [
      { question_id: 'q1', attempt_id: 'a1', answered_at: '2026-11-01T10:00:00Z', kind: 'practice' },
      { question_id: 'q1', attempt_id: 'a2', answered_at: '2026-11-02T10:00:00Z', kind: 'practice' },
      { question_id: 'q2', attempt_id: 'a3', answered_at: '2026-11-02T09:00:00Z', kind: 'diagnostic' },
      { question_id: 'q3', attempt_id: 'a3', answered_at: '2026-11-02T11:00:00Z', kind: 'diagnostic' },
    ]
    const out = latestMistakes(rows, new Set(['q3']), 5)
    expect(out.map((r) => [r.question_id, r.attempt_id])).toEqual([
      ['q1', 'a2'],
      ['q2', 'a3'],
    ])
    expect(latestMistakes(rows, new Set(), 1)).toHaveLength(1)
  })
})
