import 'server-only'
import type { Db } from '@/lib/supabase/server'
import type { SafeQuestion } from '@/types/questions'
import { ApiError } from '@/lib/api/errors'
import { loadSafeQuestions } from '@/features/questions/server'
import { isUniqueViolation } from '@/features/practice/queries'
import type { ToggleBookmarkInput } from './schemas'

export type ToggleResult = { bookmarked: boolean; bookmarkId: string | null; target: 'question' | 'lesson'; targetId: string }

/**
 * A question can be bookmarked only if it was assigned to the student in one of their own
 * attempts — so ids cannot be used to enumerate the bank. Lessons must be published.
 */
async function assertQuestionSeen(admin: Db, userId: string, questionId: string): Promise<void> {
  const { data, error } = await admin
    .from('attempt_questions')
    .select('id, attempts!inner(user_id)')
    .eq('question_id', questionId)
    .eq('attempts.user_id', userId)
    .limit(1)
  if (error) throw error
  if (!data || data.length === 0) throw new ApiError(404, 'NOT_FOUND', 'Question not found.')
}

async function assertLessonPublished(admin: Db, lessonId: string): Promise<void> {
  const { data, error } = await admin.from('lessons').select('id').eq('id', lessonId).eq('status', 'published').maybeSingle()
  if (error) throw error
  if (!data) throw new ApiError(404, 'NOT_FOUND', 'Lesson not found.')
}

export async function toggleBookmark(admin: Db, userId: string, input: ToggleBookmarkInput): Promise<ToggleResult> {
  const target = 'questionId' in input ? ('question' as const) : ('lesson' as const)
  const targetId = 'questionId' in input ? input.questionId : input.lessonId
  const column = target === 'question' ? 'question_id' : 'lesson_id'

  const { data: existing, error } = await admin.from('bookmarks').select('id').eq('user_id', userId).eq(column, targetId).maybeSingle()
  if (error) throw error
  if (existing) {
    const { error: delError } = await admin.from('bookmarks').delete().eq('id', existing.id).eq('user_id', userId)
    if (delError) throw delError
    return { bookmarked: false, bookmarkId: null, target, targetId }
  }

  if (target === 'question') await assertQuestionSeen(admin, userId, targetId)
  else await assertLessonPublished(admin, targetId)

  const { data: created, error: insError } = await admin
    .from('bookmarks')
    .insert(target === 'question' ? { user_id: userId, question_id: targetId } : { user_id: userId, lesson_id: targetId })
    .select('id')
    .single()
  if (insError) {
    if (isUniqueViolation(insError)) {
      const { data: again } = await admin.from('bookmarks').select('id').eq('user_id', userId).eq(column, targetId).maybeSingle()
      return { bookmarked: true, bookmarkId: again?.id ?? null, target, targetId }
    }
    throw insError
  }
  return { bookmarked: true, bookmarkId: created.id, target, targetId }
}

export async function deleteBookmark(admin: Db, userId: string, bookmarkId: string): Promise<{ deleted: boolean }> {
  const { data, error } = await admin.from('bookmarks').delete().eq('id', bookmarkId).eq('user_id', userId).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new ApiError(404, 'NOT_FOUND', 'Bookmark not found.')
  return { deleted: true }
}

export type QuestionBookmark = { id: string; createdAt: string; question: SafeQuestion; published: boolean }
export type LessonBookmark = { id: string; createdAt: string; lessonId: string; title: string; description: string; durationSeconds: number; courseTitle: string }

export async function listBookmarks(admin: Db, userId: string): Promise<{ questions: QuestionBookmark[]; lessons: LessonBookmark[] }> {
  const { data, error } = await admin
    .from('bookmarks')
    .select('id, question_id, lesson_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  const rows = data ?? []
  const questionIds = rows.map((r) => r.question_id).filter((x): x is string => !!x)
  const lessonIds = rows.map((r) => r.lesson_id).filter((x): x is string => !!x)

  const [safe, statuses, lessons] = await Promise.all([
    loadSafeQuestions(admin, questionIds),
    questionIds.length
      ? admin.from('questions').select('id, status').in('id', questionIds)
      : Promise.resolve({ data: [] as Array<{ id: string; status: string }>, error: null }),
    lessonIds.length
      ? admin
          .from('lessons')
          .select('id, title, description, duration_seconds, courses!inner(title, status)')
          .in('id', lessonIds)
          .eq('status', 'published')
          .eq('courses.status', 'published')
      : Promise.resolve({ data: [] as Array<{ id: string; title: string; description: string; duration_seconds: number; courses: { title: string; status: string } }>, error: null }),
  ])
  if (statuses.error) throw statuses.error
  if (lessons.error) throw lessons.error
  const statusById = new Map((statuses.data ?? []).map((q) => [q.id, q.status]))
  const lessonById = new Map((lessons.data ?? []).map((l) => [l.id, l]))

  const questions: QuestionBookmark[] = []
  const lessonItems: LessonBookmark[] = []
  for (const r of rows) {
    if (r.question_id) {
      const question = safe.get(r.question_id)
      if (!question) continue
      questions.push({ id: r.id, createdAt: r.created_at, question, published: statusById.get(r.question_id) === 'published' })
    } else if (r.lesson_id) {
      const lesson = lessonById.get(r.lesson_id)
      if (!lesson) continue
      const course = Array.isArray(lesson.courses) ? lesson.courses[0] : lesson.courses
      lessonItems.push({
        id: r.id,
        createdAt: r.created_at,
        lessonId: lesson.id,
        title: lesson.title,
        description: lesson.description,
        durationSeconds: lesson.duration_seconds,
        courseTitle: course?.title ?? '',
      })
    }
  }
  return { questions, lessons: lessonItems }
}
