import 'server-only'
import type { Db } from '@/lib/supabase/server'
import type { CurrentProfile } from '@/lib/auth/session'
import { localDate } from '@/lib/time'
import { getEntitlements, getUsage, type Entitlements } from '@/features/entitlements/server'
import { loadCatalog } from '@/features/courses/server'
import { firstIncompleteLesson, SUBJECT_SLUGS, type CatalogLesson, type ProgressSummary } from '@/features/courses/catalog'
import {
  pickRecommendedSkills,
  rollupByDomain,
  rollupBySubject,
  skillStats,
  tally,
  totals,
  weakestSkills,
  type Recommendation,
  type SkillPerfRow,
  type SkillStat,
  type Tally,
} from '@/features/analytics/aggregate'
import type { SubjectCode } from '@/types/questions'
import {
  currentWeek,
  estimatePoints,
  examCountdown,
  latestEstimate,
  resultHref,
  taskHref,
  type EstimatePoint,
  type ExamCountdown,
  type LatestEstimate,
  type WeekDay,
} from './logic'

export type ContinueLesson = {
  state: 'resume' | 'next'
  lesson: CatalogLesson
  courseTitle: string
  subjectCode: SubjectCode
  positionSeconds: number
  watchedSeconds: number
}

export type ContinueLearning = ContinueLesson | { state: 'all_done' } | { state: 'no_lessons' }

export type SectionProgress = {
  code: SubjectCode
  name: string
  slug: string
  scored: Tally
  lessons: ProgressSummary
  domains: Array<{ id: string; name: string; scored: Tally; lessonsTotal: number; lessonsCompleted: number }>
}

export type TodayTask = {
  id: string
  type: 'lesson' | 'practice' | 'review' | 'mock_exam' | 'diagnostic'
  title: string
  description: string
  minutes: number
  status: 'pending' | 'completed' | 'skipped'
  href: string
}

export type RecentResult = {
  id: string
  kind: 'practice' | 'diagnostic' | 'mock_exam'
  practiceMode: 'custom' | 'set' | 'retry' | 'bookmarks' | null
  title: string | null
  contextName: string | null
  completedAt: string
  correct: number
  total: number
  estimate: { low: number; high: number } | null
  href: string
}

export type MockCard =
  | { state: 'in_progress'; mockExamId: string; title: string; href: string }
  | {
      state: 'next'
      mockExamId: string
      title: string
      isFullLength: boolean
      href: string
      included: boolean
      allowance: { used: number; limit: number | null } | null
    }
  | { state: 'none' | 'all_done' }

export type DashboardData = {
  today: string
  isNewStudent: boolean
  streak: number
  week: WeekDay[]
  studySeconds: number
  practiceAnswered: number
  scored: Tally
  lessons: { completed: number; published: number }
  entitlements: Entitlements
  continueLearning: ContinueLearning
  sections: SectionProgress[]
  plan: { hasPlan: boolean; included: boolean; tasks: TodayTask[] }
  recommended: Recommendation[]
  strongest: SkillStat[]
  weakest: SkillStat[]
  recent: RecentResult[]
  estimates: EstimatePoint[]
  latest: LatestEstimate
  hasCompletedDiagnostic: boolean
  targetScore: number | null
  exam: ExamCountdown
  mock: MockCard
}

const TASK_TYPES = new Set(['lesson', 'practice', 'review', 'mock_exam', 'diagnostic'])
const ATTEMPT_KINDS = new Set(['practice', 'diagnostic', 'mock_exam'])

function must<T>(res: { data: T | null; error: { message: string } | null }): T | null {
  if (res.error) throw res.error
  return res.data
}

function rows<T>(res: { data: T[] | null; error: { message: string } | null }): T[] {
  if (res.error) throw res.error
  return res.data ?? []
}

/**
 * Everything the dashboard home renders, loaded in parallel. User-scoped client (RLS) for the
 * student's own rows; the service role only for activity_streak and plan usage, both filtered by
 * the authorized user's id.
 */
export async function loadDashboard(db: Db, admin: () => Db, profile: CurrentProfile): Promise<DashboardData> {
  const userId = profile.id
  const tz = profile.timezone || 'Asia/Tashkent'
  const today = localDate(tz)

  const [catalog, entitlements, streakRes, activityRes, perfRes, practiceCountRes, recentRes, estimateRes, diagCountRes, planRes, mockInProgressRes, mockExamsRes, completedMocksRes] =
    await Promise.all([
      loadCatalog(db, userId),
      getEntitlements(userId),
      admin().rpc('activity_streak', { p_user_id: userId, p_today: today }),
      db
        .from('user_daily_activity')
        .select('activity_date, study_seconds, questions_answered, correct_answers, lessons_completed')
        .eq('user_id', userId),
      db.rpc('my_skill_performance'),
      db
        .from('attempt_answers')
        .select('id, attempts!inner(kind)', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('attempts.kind', 'practice')
        .not('answered_at', 'is', null),
      db
        .from('attempts')
        .select(
          'id, kind, practice_mode, subject_id, skill_id, total_questions, correct_count, completed_at, rw_estimate_low, rw_estimate_high, math_estimate_low, math_estimate_high, mock_exams(title), diagnostic_tests(title)',
        )
        .eq('user_id', userId)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(5),
      db
        .from('attempts')
        .select('id, kind, completed_at, rw_estimate_low, rw_estimate_high, math_estimate_low, math_estimate_high')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .or('rw_estimate_low.not.is.null,math_estimate_low.not.is.null')
        .order('completed_at', { ascending: false })
        .limit(24),
      db.from('attempts').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', 'diagnostic').eq('status', 'completed'),
      db.from('study_plans').select('id').eq('user_id', userId).eq('status', 'active').maybeSingle(),
      db
        .from('attempts')
        .select('id, mock_exam_id, mock_exams(title)')
        .eq('user_id', userId)
        .eq('kind', 'mock_exam')
        .eq('status', 'in_progress')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      db.from('mock_exams').select('id, title, is_full_length').eq('status', 'published').order('created_at'),
      db.from('attempts').select('mock_exam_id').eq('user_id', userId).eq('kind', 'mock_exam').eq('status', 'completed'),
    ])

  const streak = must(streakRes) ?? 0
  const activity = rows(activityRes)
  const perf = (must(perfRes) ?? []) as SkillPerfRow[]
  if (practiceCountRes.error) throw practiceCountRes.error
  const recentRows = rows(recentRes)
  const estimateRows = rows(estimateRes)
  if (diagCountRes.error) throw diagCountRes.error
  const activePlan = must(planRes)
  const mockInProgress = must(mockInProgressRes)
  const mockExams = rows(mockExamsRes)
  const completedMocks = rows(completedMocksRes)

  const { taxonomy } = catalog
  const scored = totals(perf)
  const studySeconds = activity.reduce((sum, r) => sum + r.study_seconds, 0)
  const practiceAnswered = practiceCountRes.count ?? 0

  // Lessons --------------------------------------------------------------------------------
  const publishedLessons = catalog.courses.flatMap((c) => c.lessons)
  const completedLessons = publishedLessons.filter((l) => catalog.progress.get(l.id)?.completed).length

  const courseById = new Map(catalog.courses.map((c) => [c.id, c]))
  let continueLearning: ContinueLearning
  const resumable = [...catalog.progress.values()]
    .filter((p) => !p.completed && catalog.lessonById.has(p.lessonId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  if (publishedLessons.length === 0) {
    continueLearning = { state: 'no_lessons' }
  } else if (resumable) {
    const lesson = catalog.lessonById.get(resumable.lessonId)!
    const course = courseById.get(lesson.courseId)!
    continueLearning = {
      state: 'resume',
      lesson,
      courseTitle: course.title,
      subjectCode: course.subjectCode,
      positionSeconds: resumable.lastPositionSeconds,
      watchedSeconds: resumable.watchedSeconds,
    }
  } else {
    const preferred = profile.preferredSubjects.length > 0 ? profile.preferredSubjects : (['math', 'reading_writing'] as SubjectCode[])
    const ordered = [
      ...preferred.flatMap((s) => catalog.bySubject.get(s)?.lessons ?? []),
      ...publishedLessons.filter((l) => !preferred.includes(courseById.get(l.courseId)!.subjectCode)),
    ]
    const next = firstIncompleteLesson(ordered, catalog.progress)
    if (next) {
      const course = courseById.get(next.courseId)!
      continueLearning = { state: 'next', lesson: next, courseTitle: course.title, subjectCode: course.subjectCode, positionSeconds: 0, watchedSeconds: 0 }
    } else {
      continueLearning = { state: 'all_done' }
    }
  }

  // Sections -------------------------------------------------------------------------------
  const byDomain = rollupByDomain(perf)
  const bySubject = rollupBySubject(perf)
  const sections: SectionProgress[] = taxonomy.subjects.map((subject) => {
    const subjectLessons = catalog.bySubject.get(subject.code)
    const lessons = subjectLessons?.lessons ?? []
    return {
      code: subject.code,
      name: subject.name,
      slug: SUBJECT_SLUGS[subject.code],
      scored: bySubject.get(subject.id) ?? tally(0, 0),
      lessons: subjectLessons?.summary ?? { total: 0, completed: 0, inProgress: 0, ratio: null, totalDurationSeconds: 0 },
      domains: taxonomy.domains
        .filter((d) => d.subjectId === subject.id)
        .map((d) => {
          const domainLessons = lessons.filter((l) => l.skillId && taxonomy.skillById.get(l.skillId)?.domainId === d.id)
          return {
            id: d.id,
            name: d.name,
            scored: byDomain.get(d.id) ?? tally(0, 0),
            lessonsTotal: domainLessons.length,
            lessonsCompleted: domainLessons.filter((l) => catalog.progress.get(l.id)?.completed).length,
          }
        }),
    }
  })

  // Skills ---------------------------------------------------------------------------------
  const stats = skillStats(perf, taxonomy)
  const weakest = weakestSkills(stats, 5)
  const strongest = stats
    .filter((s) => s.answered > 0)
    .sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0) || b.answered - a.answered || a.domainPosition - b.domainPosition)
    .slice(0, 5)
  const recommended = pickRecommendedSkills(stats, profile.preferredSubjects, 3)

  // Today's plan (read-only; the study-plan feature owns writes) ---------------------------
  let tasks: TodayTask[] = []
  if (activePlan) {
    const taskRows = rows(
      await db
        .from('study_plan_tasks')
        .select('id, task_type, title, description, estimated_minutes, status, subject_id, domain_id, skill_id, lesson_id, mock_exam_id, position')
        .eq('user_id', userId)
        .eq('plan_id', activePlan.id)
        .eq('scheduled_date', today)
        .order('position'),
    )
    tasks = taskRows
      .filter((t) => TASK_TYPES.has(t.task_type))
      .map((t) => ({
        id: t.id,
        type: t.task_type as TodayTask['type'],
        title: t.title,
        description: t.description,
        minutes: t.estimated_minutes,
        status: (t.status === 'completed' || t.status === 'skipped' ? t.status : 'pending') as TodayTask['status'],
        href: taskHref({
          task_type: t.task_type,
          subject_code: t.subject_id ? (taxonomy.subjectById.get(t.subject_id)?.code ?? null) : null,
          domain_id: t.domain_id,
          skill_id: t.skill_id,
          lesson_id: t.lesson_id,
          mock_exam_id: t.mock_exam_id,
        }),
      }))
  }

  // Recent results -------------------------------------------------------------------------
  const recent: RecentResult[] = recentRows
    .filter((r) => ATTEMPT_KINDS.has(r.kind) && r.completed_at)
    .map((r) => {
      const kind = r.kind as RecentResult['kind']
      const exam = r.mock_exams as { title: string } | null
      const diag = r.diagnostic_tests as { title: string } | null
      const skillName = r.skill_id ? taxonomy.skillById.get(r.skill_id)?.name : undefined
      const subjectName = r.subject_id ? taxonomy.subjectById.get(r.subject_id)?.name : undefined
      const hasEstimate =
        r.rw_estimate_low !== null && r.rw_estimate_high !== null && r.math_estimate_low !== null && r.math_estimate_high !== null
      return {
        id: r.id,
        kind,
        practiceMode: (r.practice_mode as RecentResult['practiceMode']) ?? null,
        title: kind === 'mock_exam' ? (exam?.title ?? null) : kind === 'diagnostic' ? (diag?.title ?? null) : null,
        contextName: skillName ?? subjectName ?? null,
        completedAt: r.completed_at as string,
        correct: r.correct_count,
        total: r.total_questions,
        estimate: hasEstimate
          ? {
              low: (r.rw_estimate_low ?? 0) + (r.math_estimate_low ?? 0),
              high: (r.rw_estimate_high ?? 0) + (r.math_estimate_high ?? 0),
            }
          : null,
        href: resultHref(kind, r.id),
      }
    })

  // Estimates ------------------------------------------------------------------------------
  const estimates = estimatePoints(estimateRows)
  const latest = latestEstimate(estimates)

  // Mock exam ------------------------------------------------------------------------------
  let mock: MockCard
  if (mockInProgress?.mock_exam_id) {
    mock = {
      state: 'in_progress',
      mockExamId: mockInProgress.mock_exam_id,
      title: (mockInProgress.mock_exams as { title: string } | null)?.title ?? '',
      href: `/dashboard/mock-exams/${mockInProgress.mock_exam_id}`,
    }
  } else if (mockExams.length === 0) {
    mock = { state: 'none' }
  } else {
    const done = new Set(completedMocks.map((m) => m.mock_exam_id))
    const nextExam = mockExams.find((e) => !done.has(e.id))
    if (!nextExam) {
      mock = { state: 'all_done' }
    } else {
      const feature = entitlements.features.mock_exams_monthly
      let allowance: { used: number; limit: number | null } | null = null
      if (feature.enabled) {
        allowance =
          feature.limit === null ? { used: 0, limit: null } : { used: await getUsage(userId, 'mock_exams_monthly', tz), limit: feature.limit }
      }
      mock = {
        state: 'next',
        mockExamId: nextExam.id,
        title: nextExam.title,
        isFullLength: nextExam.is_full_length,
        href: `/dashboard/mock-exams/${nextExam.id}`,
        included: feature.enabled,
        allowance,
      }
    }
  }

  const isNewStudent =
    scored.answered === 0 &&
    practiceAnswered === 0 &&
    catalog.progress.size === 0 &&
    studySeconds === 0 &&
    recentRows.length === 0 &&
    !mockInProgress

  return {
    today,
    isNewStudent,
    streak,
    week: currentWeek(today, activity),
    studySeconds,
    practiceAnswered,
    scored,
    lessons: { completed: completedLessons, published: publishedLessons.length },
    entitlements,
    continueLearning,
    sections,
    plan: { hasPlan: Boolean(activePlan), included: entitlements.features.study_plan.enabled, tasks },
    recommended,
    strongest,
    weakest,
    recent,
    estimates,
    latest,
    hasCompletedDiagnostic: (diagCountRes.count ?? 0) > 0,
    targetScore: profile.targetScore,
    exam: examCountdown(profile.examDate, today),
    mock,
  }
}
