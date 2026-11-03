import 'server-only'
import type { Db } from '@/lib/supabase/server'
import type { CurrentProfile } from '@/lib/auth/session'
import { localDate, startOfLocalDay } from '@/lib/time'
import { richTextExcerpt } from '@/lib/rich-text/tokenize'
import { lockedQuestionIds } from '@/features/practice/queries'
import { getEntitlements, getUsage, type Entitlements } from '@/features/entitlements/server'
import { loadCatalog } from '@/features/courses/server'
import { firstIncompleteLesson, SUBJECT_SLUGS, type CatalogLesson, type ProgressSummary } from '@/features/courses/catalog'
import {
  pickRecommendedSkills,
  practiceHref,
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
import {
  buildMission,
  latestMistakes,
  masteryLevel,
  todayActivity,
  weekSummary,
  type MasteryDomain,
  type Mission,
  type MistakeRow,
  type WeekSummary,
} from './today'
import { achievements, ADVANCED_DOMAIN_MIN_ANSWERS, longestStreak, type Achievement } from './achievements'

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
  practiceMode: 'custom' | 'set' | 'retry' | 'bookmarks' | 'mistakes' | null
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

export type RecentMistake = {
  questionId: string
  excerpt: string
  skillName: string | null
  answeredAt: string
  kind: 'practice' | 'diagnostic' | 'mock_exam'
  href: string
}

export type DashboardData = {
  today: string
  mission: Mission
  mastery: MasteryDomain[]
  weekSummary: WeekSummary
  mistakes: RecentMistake[]
  achievements: Achievement[]
  questionsAvailable: boolean
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

  const [
    catalog,
    entitlements,
    streakRes,
    activityRes,
    perfRes,
    practiceCountRes,
    recentRes,
    estimateRes,
    diagCountRes,
    planRes,
    mockInProgressRes,
    mockExamsRes,
    completedMocksRes,
    publishedCountRes,
    todayAttemptsRes,
    mistakeRes,
    locked,
  ] = await Promise.all([
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
      // Whether practice and the diagnostic can start at all (a count only; no question data).
      admin().from('questions').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      db
        .from('attempts')
        .select('kind, practice_mode')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .gte('completed_at', startOfLocalDay(tz).toISOString()),
      db
        .from('attempt_answers')
        .select('question_id, attempt_id, answered_at, attempts!inner(kind, status)')
        .eq('user_id', userId)
        .eq('is_correct', false)
        .eq('attempts.status', 'completed')
        .not('answered_at', 'is', null)
        .order('answered_at', { ascending: false })
        .limit(60),
      lockedQuestionIds(admin(), userId),
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
  if (publishedCountRes.error) throw publishedCountRes.error
  const questionsAvailable = (publishedCountRes.count ?? 0) > 0
  const todayAttempts = rows(todayAttemptsRes)
  const mistakeRows: MistakeRow[] = rows(mistakeRes).map((r) => ({
    question_id: r.question_id,
    attempt_id: r.attempt_id,
    answered_at: r.answered_at as string,
    kind: (r.attempts as unknown as { kind: string }).kind,
  }))

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

  // Recent mistakes (latest wrong answer per question, never from a running timed test) --------
  const allMistakes = latestMistakes(mistakeRows, locked, 60)
  const shownMistakes = allMistakes.slice(0, 5)
  let mistakes: RecentMistake[] = []
  if (shownMistakes.length > 0) {
    // Students cannot read the question bank directly (answer keys live next to it); the service
    // role reads only the stem and skill of questions this student has already answered.
    const { data: qs, error } = await admin()
      .from('questions')
      .select('id, stem, skill_id')
      .in(
        'id',
        shownMistakes.map((m) => m.question_id),
      )
    if (error) throw error
    const byId = new Map((qs ?? []).map((q) => [q.id, q]))
    mistakes = shownMistakes.flatMap((m) => {
      const q = byId.get(m.question_id)
      if (!q || !ATTEMPT_KINDS.has(m.kind)) return []
      return [
        {
          questionId: m.question_id,
          excerpt: richTextExcerpt(q.stem, 110),
          skillName: q.skill_id ? (taxonomy.skillById.get(q.skill_id)?.name ?? null) : null,
          answeredAt: m.answered_at,
          kind: m.kind as RecentMistake['kind'],
          href: resultHref(m.kind, m.attempt_id),
        },
      ]
    })
  }

  // Mastery map: every domain, in framework order ------------------------------------------------
  const mastery: MasteryDomain[] = sections.flatMap((section) =>
    section.domains.map((d) => ({
      id: d.id,
      name: d.name,
      subjectCode: section.code,
      weightPercent: taxonomy.domainById.get(d.id)?.weightPercent ?? 0,
      scored: d.scored,
      level: masteryLevel(d.scored),
      lessonsTotal: d.lessonsTotal,
      lessonsCompleted: d.lessonsCompleted,
      href: `/dashboard/practice?${new URLSearchParams({ subject: section.code, domain: d.id }).toString()}`,
    })),
  )

  // Daily mission --------------------------------------------------------------------------------
  const focus = recommended[0]
  const latestMistakeAttempt = allMistakes[0]
  const mission = buildMission({
    planTasks: tasks,
    hasCompletedDiagnostic: (diagCountRes.count ?? 0) > 0,
    diagnosticToday: todayAttempts.some((a) => a.kind === 'diagnostic'),
    questionsAvailable,
    focusSkill: focus ? { name: focus.skillName, href: practiceHref(focus) } : null,
    lesson:
      continueLearning.state === 'resume' || continueLearning.state === 'next'
        ? { title: continueLearning.lesson.title, resume: continueLearning.state === 'resume', href: `/dashboard/lesson/${continueLearning.lesson.id}` }
        : null,
    mistakes: latestMistakeAttempt ? { count: allMistakes.length, href: '/dashboard/mistakes' } : null,
    retryCompletedToday: todayAttempts.some((a) => a.kind === 'practice' && (a.practice_mode === 'retry' || a.practice_mode === 'mistakes')),
    today: todayActivity(today, activity),
    dailyStudyMinutes: profile.dailyStudyMinutes,
  })

  const isNewStudent =
    scored.answered === 0 &&
    practiceAnswered === 0 &&
    catalog.progress.size === 0 &&
    studySeconds === 0 &&
    recentRows.length === 0 &&
    !mockInProgress

  return {
    today,
    mission,
    mastery,
    weekSummary: weekSummary(today, activity, profile.dailyStudyMinutes),
    mistakes,
    achievements: achievements({
      diagnosticsCompleted: diagCountRes.count ?? 0,
      scoredAnswers: scored.answered,
      longestStreak: Math.max(streak, longestStreak(activity)),
      mocksCompleted: completedMocks.length,
      lessonsCompleted: completedLessons,
      advancedDomains: mastery.filter((d) => d.level === 'advanced' && d.scored.answered >= ADVANCED_DOMAIN_MIN_ANSWERS).length,
    }),
    questionsAvailable,
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
