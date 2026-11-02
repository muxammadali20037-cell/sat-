import { z } from 'zod'
import type { StudyPlanNarrative } from '@/lib/ai/schemas'
import type { PlanSummary } from './planner'

export const TaskStatusBody = z.object({ status: z.enum(['completed', 'skipped', 'pending']) })
export const TaskIdParam = z.guid()

export const NARRATIVE_LIMITS = { objectives: 6, objective: 160, rationale: 1200 } as const

function cut(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const slice = t.slice(0, max - 1)
  const sentence = slice.lastIndexOf('. ')
  if (sentence > max * 0.6) return slice.slice(0, sentence + 1)
  const space = slice.lastIndexOf(' ')
  return `${(space > max * 0.6 ? slice.slice(0, space) : slice).trimEnd()}…`
}

/** Validated model output → capped values that fit the study_plans columns. */
export function capNarrative(n: StudyPlanNarrative): { weeklyObjectives: string[]; rationale: string } {
  const seen = new Set<string>()
  const weeklyObjectives: string[] = []
  for (const raw of n.weekly_objectives) {
    const o = cut(raw.replace(/^[-•\d.)\s]+/, ''), NARRATIVE_LIMITS.objective)
    const key = o.toLowerCase()
    if (!o || seen.has(key)) continue
    seen.add(key)
    weeklyObjectives.push(o)
    if (weeklyObjectives.length === NARRATIVE_LIMITS.objectives) break
  }
  return { weeklyObjectives, rationale: cut(n.rationale, NARRATIVE_LIMITS.rationale) }
}

/** What the model sees: names and numbers only — no ids, no personal data. */
export function summaryForAi(summary: PlanSummary, targetScore: number | null) {
  return {
    plan_days: summary.days,
    start_date: summary.startDate,
    exam_date: summary.examDate,
    target_score: targetScore,
    daily_minutes: summary.dailyMinutes,
    total_minutes: summary.totalMinutes,
    minutes_by_subject: summary.minutesBySubject,
    minutes_by_task_type: summary.minutesByType,
    domains: summary.domains.map((d) => ({
      name: d.name,
      subject: d.subjectCode === 'math' ? 'Math' : 'Reading and Writing',
      accuracy_percent: d.accuracy === null ? 'unknown (treated as 50%)' : Math.round(d.accuracy * 100),
      planned_practice_minutes: d.practiceMinutes,
    })),
    focus_skills: summary.focusSkills.map((s) => ({ name: s.name, accuracy_percent: s.accuracy === null ? 'unknown' : Math.round(s.accuracy * 100) })),
    mock_exams: summary.mockExamDates.length,
    final_light_review_days: summary.lightReviewDates.length,
  }
}
