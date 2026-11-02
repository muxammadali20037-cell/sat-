import { describe, expect, it } from 'vitest'
import { practiceTargetQuestions, reconcileTasks, type ReconcileTask } from '@/features/study-plan/reconcile'
import { capNarrative, NARRATIVE_LIMITS, summaryForAi } from '@/features/study-plan/schemas'
import { buildStudyPlan } from '@/features/study-plan/planner'

const task = (over: Partial<ReconcileTask>): ReconcileTask => ({
  id: 't',
  type: 'practice',
  status: 'pending',
  date: '2026-11-02',
  position: 0,
  lessonId: null,
  skillId: 'sk',
  minutes: 20,
  ...over,
})
const dates = (date: string, n: number) => Array.from({ length: n }, () => date)

describe('study plan reconciliation', () => {
  it('completes lesson tasks when the lesson is completed', () => {
    const out = reconcileTasks(
      [task({ id: 'a', type: 'lesson', lessonId: 'L1', skillId: null }), task({ id: 'b', type: 'lesson', lessonId: 'L2', skillId: null })],
      { completedLessonIds: new Set(['L1']), answerDatesBySkill: {} },
      '2026-11-02',
    )
    expect(out).toEqual(['a'])
  })

  it('completes a practice task after enough answers on/after its date', () => {
    const need = practiceTargetQuestions(20)
    expect(need).toBe(8)
    const t = [task({ id: 'p1', date: '2026-11-02' })]
    expect(reconcileTasks(t, { completedLessonIds: new Set(), answerDatesBySkill: { sk: dates('2026-11-02', need - 1) } }, '2026-11-02')).toEqual([])
    expect(reconcileTasks(t, { completedLessonIds: new Set(), answerDatesBySkill: { sk: dates('2026-11-02', need) } }, '2026-11-02')).toEqual(['p1'])
  })

  it('ignores answers from before the scheduled date and future tasks', () => {
    const out = reconcileTasks(
      [task({ id: 'p1', date: '2026-11-03' }), task({ id: 'p2', date: '2026-11-05' })],
      { completedLessonIds: new Set(), answerDatesBySkill: { sk: dates('2026-11-02', 30) } },
      '2026-11-04',
    )
    expect(out).toEqual([])
  })

  it('counts each answer for one task only', () => {
    const tasks = [task({ id: 'p1', date: '2026-11-01' }), task({ id: 'p2', date: '2026-11-02' }), task({ id: 'p3', date: '2026-11-02', position: 1 })]
    const out = reconcileTasks(tasks, { completedLessonIds: new Set(), answerDatesBySkill: { sk: dates('2026-11-02', 16) } }, '2026-11-02')
    expect(out).toEqual(['p1', 'p2'])
  })

  it('lets already-completed tasks consume answers and skips skipped tasks', () => {
    const tasks = [
      task({ id: 'done', status: 'completed', date: '2026-11-01' }),
      task({ id: 'skip', status: 'skipped', date: '2026-11-01' }),
      task({ id: 'p', date: '2026-11-02' }),
    ]
    const out = reconcileTasks(tasks, { completedLessonIds: new Set(), answerDatesBySkill: { sk: dates('2026-11-02', 10) } }, '2026-11-02')
    expect(out).toEqual([])
    const more = reconcileTasks(tasks, { completedLessonIds: new Set(), answerDatesBySkill: { sk: dates('2026-11-02', 16) } }, '2026-11-02')
    expect(more).toEqual(['p'])
  })
})

describe('AI narrative caps', () => {
  it('caps objectives (≤ 6, deduplicated, trimmed, ≤ 160 chars) and rationale (≤ 1200)', () => {
    const out = capNarrative({
      weekly_objectives: ['1. Finish algebra', '- Finish algebra', '', ...Array.from({ length: 8 }, (_, i) => `Objective ${i} ${'x'.repeat(300)}`)],
      rationale: 'Sentence. '.repeat(400),
    })
    expect(out.weeklyObjectives[0]).toBe('Finish algebra')
    expect(out.weeklyObjectives).toHaveLength(NARRATIVE_LIMITS.objectives)
    expect(out.weeklyObjectives.every((o) => o.length <= NARRATIVE_LIMITS.objective)).toBe(true)
    expect(out.rationale.length).toBeLessThanOrEqual(NARRATIVE_LIMITS.rationale)
  })
  it('gives the model names and numbers only (no ids)', () => {
    const plan = buildStudyPlan(
      {
        examDate: null,
        dailyMinutes: 30,
        preferredSubjects: [],
        subjects: [{ id: '11111111-1111-1111-1111-111111111111', code: 'math' }],
        domains: [{ id: '22222222-2222-2222-2222-222222222222', subjectId: '11111111-1111-1111-1111-111111111111', name: 'Algebra', weightPercent: 35, position: 1 }],
        skills: [{ id: '33333333-3333-3333-3333-333333333333', domainId: '22222222-2222-2222-2222-222222222222', name: 'Linear functions', position: 1 }],
        domainAccuracy: {},
        skillStats: {},
        lessons: [],
        practiceSets: [],
        mockExams: [],
      },
      '2026-11-02',
    )
    const json = JSON.stringify(summaryForAi(plan.summary, 1400))
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/)
    expect(json).toContain('Algebra')
    expect(json).toContain('1400')
  })
})
