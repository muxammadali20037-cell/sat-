import 'server-only'
import type { Db } from '@/lib/supabase/server'
import { getTaxonomy, type Taxonomy } from '@/features/taxonomy/server'
import type { SubjectCode } from '@/types/questions'
import {
  lessonKindFromProvider,
  orderLessons,
  summarizeProgress,
  type CatalogLesson,
  type LessonProgressLite,
  type ProgressSummary,
} from './catalog'

export type CatalogCourse = {
  id: string
  subjectId: string
  subjectCode: SubjectCode
  slug: string
  title: string
  description: string
  level: 'all' | 'beginner' | 'intermediate' | 'advanced'
  position: number
  /** Published lessons in canonical order. */
  lessons: CatalogLesson[]
  summary: ProgressSummary
}

export type Catalog = {
  taxonomy: Taxonomy
  courses: CatalogCourse[]
  /** Every published lesson across courses, by id. */
  lessonById: Map<string, CatalogLesson>
  progress: Map<string, LessonProgressLite>
  bySubject: Map<SubjectCode, { courses: CatalogCourse[]; lessons: CatalogLesson[]; summary: ProgressSummary }>
}

const LEVELS = new Set(['all', 'beginner', 'intermediate', 'advanced'])

/**
 * Published courses and lessons with the user's own progress. Uses the user-scoped client:
 * RLS limits students to published rows; the explicit status filters keep staff (who can read
 * drafts) seeing exactly what students see.
 */
export async function loadCatalog(db: Db, userId: string): Promise<Catalog> {
  const [taxonomy, coursesRes, progressRes] = await Promise.all([
    getTaxonomy(db),
    db
      .from('courses')
      .select('id, subject_id, slug, title, description, level, position')
      .eq('status', 'published')
      .order('position')
      .order('title'),
    db
      .from('lesson_progress')
      .select('lesson_id, watched_seconds, last_position_seconds, completed_at, updated_at')
      .eq('user_id', userId),
  ])
  if (coursesRes.error) throw coursesRes.error
  if (progressRes.error) throw progressRes.error

  const courseRows = coursesRes.data
  const lessonsRes =
    courseRows.length > 0
      ? await db
          .from('lessons')
          .select('id, course_id, skill_id, title, description, video_provider, duration_seconds, position, is_free_preview')
          .eq('status', 'published')
          .in(
            'course_id',
            courseRows.map((c) => c.id),
          )
      : { data: [], error: null }
  if (lessonsRes.error) throw lessonsRes.error

  const progress = new Map<string, LessonProgressLite>()
  for (const p of progressRes.data) {
    progress.set(p.lesson_id, {
      lessonId: p.lesson_id,
      watchedSeconds: p.watched_seconds,
      lastPositionSeconds: p.last_position_seconds,
      completed: p.completed_at !== null,
      updatedAt: p.updated_at,
    })
  }

  const lessonsByCourse = new Map<string, CatalogLesson[]>()
  const lessonById = new Map<string, CatalogLesson>()
  for (const l of lessonsRes.data ?? []) {
    const lesson: CatalogLesson = {
      id: l.id,
      courseId: l.course_id,
      skillId: l.skill_id,
      title: l.title,
      description: l.description,
      kind: lessonKindFromProvider(l.video_provider),
      durationSeconds: l.duration_seconds,
      position: l.position,
      isFreePreview: l.is_free_preview,
    }
    lessonById.set(lesson.id, lesson)
    const list = lessonsByCourse.get(lesson.courseId) ?? []
    list.push(lesson)
    lessonsByCourse.set(lesson.courseId, list)
  }

  const courses: CatalogCourse[] = []
  for (const c of courseRows) {
    const subject = taxonomy.subjectById.get(c.subject_id)
    if (!subject) continue
    const lessons = orderLessons(lessonsByCourse.get(c.id) ?? [], taxonomy)
    courses.push({
      id: c.id,
      subjectId: c.subject_id,
      subjectCode: subject.code,
      slug: c.slug,
      title: c.title,
      description: c.description,
      level: (LEVELS.has(c.level) ? c.level : 'all') as CatalogCourse['level'],
      position: c.position,
      lessons,
      summary: summarizeProgress(lessons, progress),
    })
  }

  const bySubject: Catalog['bySubject'] = new Map()
  for (const subject of taxonomy.subjects) {
    const subjectCourses = courses.filter((c) => c.subjectId === subject.id)
    const lessons = subjectCourses.flatMap((c) => c.lessons)
    bySubject.set(subject.code, { courses: subjectCourses, lessons, summary: summarizeProgress(lessons, progress) })
  }

  return { taxonomy, courses, lessonById, progress, bySubject }
}
