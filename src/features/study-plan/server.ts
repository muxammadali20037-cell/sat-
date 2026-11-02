import 'server-only'
import type { Db } from '@/lib/supabase/server'
import type { CurrentProfile } from '@/lib/auth/session'
import { ApiError, notFoundError } from '@/lib/api/errors'
import { localDate } from '@/lib/time'
import { getTaxonomy } from '@/features/taxonomy/server'
import { getEntitlements, getUsage, requireFeature } from '@/features/entitlements/server'
import { aiAvailability, aiModels, getAiProvider } from '@/lib/ai/provider'
import { createUsageSink, loadPricing } from '@/lib/ai/usage'
import { runStructured } from '@/lib/ai/run'
import { SCHEMA_NAMES, StudyPlanNarrativeSchema } from '@/lib/ai/schemas'
import { buildPlanSummaryContent, studyPlanSystemPrompt } from '@/lib/ai/prompts'
import {
  buildStudyPlan,
  combineDomainAccuracy,
  PLANNER,
  type AnswerStat,
  type PlannerInput,
  type PlannedTask,
} from './planner'
import { reconcileTasks, type ReconcileTask } from './reconcile'
import { capNarrative, summaryForAi } from './schemas'

/** Inputs, generation, persistence and reconciliation of study plans (service role after auth). */

export async function gatherPlannerInput(admin: Db, db: Db, profile: CurrentProfile): Promise<PlannerInput> {
  const userId = profile.id
  const taxonomy = await getTaxonomy(db)
  const [diag, perf, lessons, progress, sets, exams] = await Promise.all([
    admin
      .from('diagnostic_results')
      .select('domain_id, correct_count, total_count, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100),
    admin.rpc('skill_performance', { p_user_id: userId }),
    db
      .from('lessons')
      .select('id, skill_id, title, duration_seconds, position, courses!inner(position, status)')
      .eq('status', 'published')
      .eq('courses.status', 'published')
      .not('skill_id', 'is', null)
      .limit(1000),
    admin.from('lesson_progress').select('lesson_id').eq('user_id', userId).not('completed_at', 'is', null).limit(2000),
    db.from('practice_sets').select('id, title, subject_id, domain_id, skill_id').eq('status', 'published').limit(500),
    db
      .from('mock_exams')
      .select('id, title, created_at, mock_exam_modules(section, module_number, duration_seconds)')
      .eq('status', 'published')
      .order('created_at')
      .limit(50),
  ])
  for (const r of [diag, perf, lessons, progress, sets, exams]) if (r.error) throw r.error

  // Latest diagnostic result per domain.
  const diagnostic: Record<string, { correct: number; total: number }> = {}
  for (const row of diag.data ?? []) {
    if (!diagnostic[row.domain_id]) diagnostic[row.domain_id] = { correct: row.correct_count, total: row.total_count }
  }
  const skillStats: Record<string, AnswerStat> = {}
  const domainPerf: Record<string, AnswerStat> = {}
  for (const row of perf.data ?? []) {
    skillStats[row.skill_id] = { answered: row.answered, correct: row.correct }
    const d = (domainPerf[row.domain_id] ??= { answered: 0, correct: 0 })
    d.answered += row.answered
    d.correct += row.correct
  }
  const completed = new Set((progress.data ?? []).map((p) => p.lesson_id))

  type LessonRow = { id: string; skill_id: string | null; title: string; duration_seconds: number; position: number; courses: { position: number } | { position: number }[] | null }
  const lessonRows = (lessons.data ?? []) as unknown as LessonRow[]
  const coursePos = (c: LessonRow['courses']) => (Array.isArray(c) ? (c[0]?.position ?? 0) : (c?.position ?? 0))

  type ExamRow = { id: string; title: string; mock_exam_modules: { section: string; module_number: number; duration_seconds: number }[] | null }
  const examRows = (exams.data ?? []) as unknown as ExamRow[]

  return {
    examDate: profile.examDate,
    dailyMinutes: profile.dailyStudyMinutes ?? 60,
    preferredSubjects: profile.preferredSubjects,
    subjects: taxonomy.subjects.map((s) => ({ id: s.id, code: s.code })),
    domains: taxonomy.domains.map((d) => ({ id: d.id, subjectId: d.subjectId, name: d.name, weightPercent: d.weightPercent, position: d.position })),
    skills: taxonomy.skills.map((s) => ({ id: s.id, domainId: s.domainId, name: s.name, position: s.position })),
    domainAccuracy: combineDomainAccuracy(
      taxonomy.domains.map((d) => d.id),
      diagnostic,
      domainPerf,
    ),
    skillStats,
    lessons: lessonRows
      .filter((l) => l.skill_id && !completed.has(l.id))
      .map((l) => ({
        id: l.id,
        skillId: l.skill_id!,
        title: l.title,
        durationSeconds: l.duration_seconds,
        order: coursePos(l.courses) * 1000 + l.position,
      })),
    practiceSets: (sets.data ?? []).map((s) => ({ id: s.id, title: s.title, subjectId: s.subject_id, domainId: s.domain_id, skillId: s.skill_id })),
    mockExams: examRows.map((e) => {
      // Module 1 + the longest module 2 per section; falls back to the standard 134 minutes.
      const bySection = new Map<string, { m1: number; m2: number }>()
      for (const m of e.mock_exam_modules ?? []) {
        const cur = bySection.get(m.section) ?? { m1: 0, m2: 0 }
        if (m.module_number === 1) cur.m1 = Math.max(cur.m1, m.duration_seconds)
        else cur.m2 = Math.max(cur.m2, m.duration_seconds)
        bySection.set(m.section, cur)
      }
      const seconds = [...bySection.values()].reduce((s, v) => s + v.m1 + v.m2, 0)
      return { id: e.id, title: e.title, minutes: seconds > 0 ? Math.round(seconds / 60) : PLANNER.MOCK_DEFAULT_MINUTES }
    }),
  }
}

export type GenerateOutcome = {
  planId: string
  generatedBy: 'rules' | 'rules_ai'
  taskCount: number
  /** Why AI objectives are missing, when they are. */
  aiNote: 'not_configured' | 'limit_reached' | 'failed' | null
}

/**
 * Builds and saves a new active plan (archiving the previous one). Works without AI; when AI is
 * configured and the daily AI limit allows, the model writes objectives + rationale from the summary.
 */
export async function generateStudyPlan(ctx: { profile: CurrentProfile; admin: Db; db: Db }): Promise<GenerateOutcome> {
  const { profile, admin, db } = ctx
  await requireFeature(profile.id, 'study_plan')
  const today = localDate(profile.timezone)
  const input = await gatherPlannerInput(admin, db, profile)
  const plan = buildStudyPlan(input, today)

  let weeklyObjectives: string[] = []
  let rationale = ''
  let generatedBy: 'rules' | 'rules_ai' = 'rules'
  let aiNote: GenerateOutcome['aiNote'] = null

  if (aiAvailability() === 'none') {
    aiNote = 'not_configured'
  } else {
    const ent = await getEntitlements(profile.id)
    const feature = ent.features.ai_requests_daily
    const used = feature.enabled ? await getUsage(profile.id, 'ai_requests_daily', profile.timezone) : 0
    if (!feature.enabled || (feature.limit !== null && used >= feature.limit)) {
      aiNote = 'limit_reached'
    } else {
      try {
        const run = await runStructured({
          provider: getAiProvider(),
          sink: createUsageSink(admin),
          pricing: await loadPricing(admin),
          endpoint: 'study_plan',
          userId: profile.id,
          sessionId: null,
          request: {
            system: studyPlanSystemPrompt(profile.locale),
            messages: [{ role: 'user', content: buildPlanSummaryContent(summaryForAi(plan.summary, profile.targetScore)) }],
            schema: StudyPlanNarrativeSchema,
            jsonSchemaName: SCHEMA_NAMES.narrative,
            model: aiModels().fast,
            maxTokens: 1200,
          },
        })
        const capped = capNarrative(run.data)
        weeklyObjectives = capped.weeklyObjectives
        rationale = capped.rationale
        generatedBy = weeklyObjectives.length > 0 || rationale ? 'rules_ai' : 'rules'
      } catch (err) {
        // The plan never depends on the model: fall back to rules-only.
        console.warn('[study-plan] AI narrative unavailable, saving rules-only plan', err instanceof Error ? err.message : err)
        aiNote = 'failed'
      }
    }
  }

  return savePlan(admin, profile, plan.startDate, plan.endDate, plan.tasks, { weeklyObjectives, rationale, generatedBy, aiNote })
}

async function savePlan(
  admin: Db,
  profile: CurrentProfile,
  startDate: string,
  endDate: string,
  tasks: PlannedTask[],
  extra: { weeklyObjectives: string[]; rationale: string; generatedBy: 'rules' | 'rules_ai'; aiNote: GenerateOutcome['aiNote'] },
): Promise<GenerateOutcome> {
  const userId = profile.id
  const { data: previous, error: prevError } = await admin
    .from('study_plans')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
  if (prevError) throw prevError
  const previousIds = (previous ?? []).map((p) => p.id)

  if (previousIds.length > 0) {
    const { error } = await admin.from('study_plans').update({ status: 'archived' }).in('id', previousIds).eq('user_id', userId)
    if (error) throw error
  }

  const restore = async () => {
    if (previousIds.length > 0) {
      await admin.from('study_plans').update({ status: 'active' }).eq('id', previousIds[0]!).eq('user_id', userId)
    }
  }

  const target = profile.targetScore
  const { data: plan, error: planError } = await admin
    .from('study_plans')
    .insert({
      user_id: userId,
      status: 'active',
      generated_by: extra.generatedBy,
      target_score: target !== null && target >= 400 && target <= 1600 ? target : null,
      exam_date: profile.examDate,
      daily_minutes: Math.max(10, Math.min(600, profile.dailyStudyMinutes ?? 60)),
      start_date: startDate,
      end_date: endDate,
      weekly_objectives: extra.weeklyObjectives,
      rationale: extra.rationale,
    })
    .select('id')
    .single()
  if (planError) {
    await restore()
    throw planError
  }

  try {
    const rows = tasks.map((t) => ({
      plan_id: plan.id,
      user_id: userId,
      scheduled_date: t.date,
      task_type: t.type,
      title: t.title.slice(0, 200),
      description: t.description,
      subject_id: t.subjectId,
      domain_id: t.domainId,
      skill_id: t.skillId,
      lesson_id: t.lessonId,
      practice_set_id: t.practiceSetId,
      mock_exam_id: t.mockExamId,
      estimated_minutes: Math.max(5, Math.min(240, t.minutes)),
      position: t.position,
    }))
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from('study_plan_tasks').insert(rows.slice(i, i + 500))
      if (error) throw error
    }
  } catch (err) {
    // Partial failure: remove the new plan (tasks cascade) and bring the previous one back.
    await admin.from('study_plans').delete().eq('id', plan.id).eq('user_id', userId)
    await restore()
    throw err
  }

  return { planId: plan.id, generatedBy: extra.generatedBy, taskCount: tasks.length, aiNote: extra.aiNote }
}

// ---------------------------------------------------------------------------
// Reading, reconciliation and task updates
// ---------------------------------------------------------------------------

export type PlanRow = {
  id: string
  status: string
  generated_by: string
  target_score: number | null
  exam_date: string | null
  daily_minutes: number
  start_date: string
  end_date: string
  weekly_objectives: string[]
  rationale: string
  created_at: string
}

export type TaskRow = {
  id: string
  scheduled_date: string
  task_type: string
  title: string
  description: string
  subject_id: string | null
  domain_id: string | null
  skill_id: string | null
  lesson_id: string | null
  practice_set_id: string | null
  mock_exam_id: string | null
  estimated_minutes: number
  status: 'pending' | 'completed' | 'skipped'
  completed_at: string | null
  position: number
}

/** Active plan + tasks for the signed-in student (RLS client). */
export async function loadActivePlan(db: Db, userId: string): Promise<{ plan: PlanRow; tasks: TaskRow[] } | null> {
  const { data: plan, error } = await db
    .from('study_plans')
    .select('id, status, generated_by, target_score, exam_date, daily_minutes, start_date, end_date, weekly_objectives, rationale, created_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw error
  if (!plan) return null
  const tasks: TaskRow[] = []
  for (let from = 0; from < 5000; from += 1000) {
    const { data, error: taskError } = await db
      .from('study_plan_tasks')
      .select(
        'id, scheduled_date, task_type, title, description, subject_id, domain_id, skill_id, lesson_id, practice_set_id, mock_exam_id, estimated_minutes, status, completed_at, position',
      )
      .eq('plan_id', plan.id)
      .eq('user_id', userId)
      .order('scheduled_date')
      .order('position')
      .range(from, from + 999)
    if (taskError) throw taskError
    tasks.push(...((data ?? []) as TaskRow[]))
    if ((data ?? []).length < 1000) break
  }
  return { plan: plan as PlanRow, tasks }
}

/** Auto-completes lesson/practice tasks from real progress. Returns the ids it completed. */
export async function reconcilePlan(admin: Db, profile: CurrentProfile, plan: PlanRow, tasks: TaskRow[]): Promise<string[]> {
  const pending = tasks.filter((t) => t.status === 'pending' && (t.task_type === 'lesson' || t.task_type === 'practice'))
  if (pending.length === 0) return []
  const today = localDate(profile.timezone)
  const lessonIds = [...new Set(pending.filter((t) => t.lesson_id).map((t) => t.lesson_id!))]

  const [progress, answers] = await Promise.all([
    lessonIds.length
      ? admin.from('lesson_progress').select('lesson_id').eq('user_id', profile.id).in('lesson_id', lessonIds).not('completed_at', 'is', null)
      : Promise.resolve({ data: [] as { lesson_id: string }[], error: null }),
    admin
      .from('attempt_answers')
      .select('answered_at, questions!inner(skill_id)')
      .eq('user_id', profile.id)
      .not('is_correct', 'is', null)
      .gte('answered_at', `${plan.start_date}T00:00:00Z`)
      .order('answered_at')
      .limit(5000),
  ])
  if (progress.error) throw progress.error
  if (answers.error) throw answers.error

  const answerDatesBySkill: Record<string, string[]> = {}
  type AnswerRow = { answered_at: string | null; questions: { skill_id: string } | { skill_id: string }[] | null }
  for (const row of (answers.data ?? []) as unknown as AnswerRow[]) {
    const q = Array.isArray(row.questions) ? row.questions[0] : row.questions
    if (!q || !row.answered_at) continue
    ;(answerDatesBySkill[q.skill_id] ??= []).push(localDate(profile.timezone, new Date(row.answered_at)))
  }

  const toComplete = reconcileTasks(
    tasks.map<ReconcileTask>((t) => ({
      id: t.id,
      type: t.task_type,
      status: t.status,
      date: t.scheduled_date,
      position: t.position,
      lessonId: t.lesson_id,
      skillId: t.skill_id,
      minutes: t.estimated_minutes,
    })),
    { completedLessonIds: new Set((progress.data ?? []).map((p) => p.lesson_id)), answerDatesBySkill },
    today,
  )
  if (toComplete.length === 0) return []
  const { error } = await admin
    .from('study_plan_tasks')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .in('id', toComplete)
    .eq('user_id', profile.id)
    .eq('status', 'pending')
  if (error) {
    console.error('[study-plan] reconciliation update failed', error)
    return []
  }
  return toComplete
}

export async function updateTaskStatus(
  admin: Db,
  userId: string,
  taskId: string,
  status: 'completed' | 'skipped' | 'pending',
): Promise<{ id: string; status: string; completedAt: string | null }> {
  const { data, error } = await admin
    .from('study_plan_tasks')
    .update({ status, completed_at: status === 'completed' ? new Date().toISOString() : null })
    .eq('id', taskId)
    .eq('user_id', userId)
    .select('id, status, completed_at')
    .maybeSingle()
  if (error) throw error
  if (!data) throw notFoundError('Task')
  return { id: data.id, status: data.status, completedAt: data.completed_at }
}

export function assertValidTaskId(id: string | undefined): string {
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new ApiError(404, 'NOT_FOUND', 'Task not found.')
  }
  return id
}
