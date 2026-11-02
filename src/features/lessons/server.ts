import 'server-only'
import type { Db } from '@/lib/supabase/server'
import { ApiError } from '@/lib/api/errors'
import { getPlaybackSource, isVideoProvider } from '@/lib/video'
import { getTaxonomy } from '@/features/taxonomy/server'
import { getEntitlements } from '@/features/entitlements/server'
import { hasRole, STAFF_ROLES, type Role } from '@/config/roles'
import { practiceHref } from '@/features/analytics/aggregate'
import {
  adjacentLessons,
  isUuid,
  lessonKindFromProvider,
  orderLessons,
  SUBJECT_SLUGS,
  type CatalogLesson,
} from '@/features/courses/catalog'
import { completionThreshold, normalizeCompletionRatio, PROGRESS_RULES } from './progress'
import type { LessonResourceView, LessonView } from './types'

const RESOURCE_URL_TTL_SECONDS = 60 * 60

/** platform_settings 'lessons.completion_ratio' (public setting), default 0.9. */
export async function getCompletionRatio(db: Db): Promise<number> {
  const { data, error } = await db.from('platform_settings').select('value').eq('key', 'lessons.completion_ratio').maybeSingle()
  if (error) {
    console.error('[lessons] completion ratio unavailable, using default', error.message)
    return PROGRESS_RULES.defaultCompletionRatio
  }
  return normalizeCompletionRatio(data?.value)
}

export type PublishedLessonRow = {
  id: string
  course_id: string
  skill_id: string | null
  title: string
  description: string
  objectives: string[]
  video_provider: string
  duration_seconds: number
  is_free_preview: boolean
  courses: { id: string; title: string; subject_id: string; status: string }
}

/**
 * A lesson that is published in a published course, read through the user-scoped client
 * (RLS shows students only published rows; the filters keep staff on the same rules).
 */
export async function getPublishedLesson(db: Db, lessonId: string): Promise<PublishedLessonRow | null> {
  if (!isUuid(lessonId)) return null
  const { data, error } = await db
    .from('lessons')
    .select(
      'id, course_id, skill_id, title, description, objectives, video_provider, duration_seconds, is_free_preview, courses!inner(id, title, subject_id, status)',
    )
    .eq('id', lessonId)
    .eq('status', 'published')
    .eq('courses.status', 'published')
    .maybeSingle()
  if (error) throw error
  return (data as PublishedLessonRow | null) ?? null
}

/** Paid lessons need `video_lessons`; free previews are open; staff may review every lesson. */
export async function canAccessLesson(user: { id: string; role: Role }, lesson: { is_free_preview: boolean }): Promise<boolean> {
  if (lesson.is_free_preview) return true
  if (hasRole(user.role, STAFF_ROLES)) return true
  const ent = await getEntitlements(user.id)
  return ent.features.video_lessons.enabled
}

/**
 * Everything the lesson page and GET /api/lessons/[id] need. Returns null when the lesson does
 * not exist or is not published. Paid content (notes, playback, resource files) is read with the
 * service role ONLY after the entitlement check, and never for a locked lesson.
 */
export async function getLessonView(options: { db: Db; admin: () => Db; user: { id: string; role: Role }; lessonId: string }): Promise<LessonView | null> {
  const { db, admin, user, lessonId } = options
  const lesson = await getPublishedLesson(db, lessonId)
  if (!lesson) return null

  const [taxonomy, entitled, completionRatio, progressRes, bookmarkRes, siblingsRes, resourcesRes] = await Promise.all([
    getTaxonomy(db),
    canAccessLesson(user, lesson),
    getCompletionRatio(db),
    db
      .from('lesson_progress')
      .select('watched_seconds, last_position_seconds, completed_at')
      .eq('user_id', user.id)
      .eq('lesson_id', lesson.id)
      .maybeSingle(),
    db.from('bookmarks').select('id').eq('user_id', user.id).eq('lesson_id', lesson.id).maybeSingle(),
    db
      .from('lessons')
      .select('id, course_id, skill_id, title, description, video_provider, duration_seconds, position, is_free_preview')
      .eq('course_id', lesson.course_id)
      .eq('status', 'published'),
    db.from('lesson_resources').select('id, title, kind, url, storage_path, position').eq('lesson_id', lesson.id).order('position'),
  ])
  if (progressRes.error) throw progressRes.error
  if (bookmarkRes.error) throw bookmarkRes.error
  if (siblingsRes.error) throw siblingsRes.error
  if (resourcesRes.error) throw resourcesRes.error

  const kind = lessonKindFromProvider(lesson.video_provider)
  const subject = taxonomy.subjectById.get(lesson.courses.subject_id)
  const skill = lesson.skill_id ? taxonomy.skillById.get(lesson.skill_id) : undefined
  const domain = skill ? taxonomy.domainById.get(skill.domainId) : undefined

  // Previous / next lesson in the course (canonical order).
  const siblings: CatalogLesson[] = siblingsRes.data.map((l) => ({
    id: l.id,
    courseId: l.course_id,
    skillId: l.skill_id,
    title: l.title,
    description: l.description,
    kind: lessonKindFromProvider(l.video_provider),
    durationSeconds: l.duration_seconds,
    position: l.position,
    isFreePreview: l.is_free_preview,
  }))
  const { prev, next } = adjacentLessons(orderLessons(siblings, taxonomy), lesson.id)
  const neighbor = (l: CatalogLesson | null) => (l ? { id: l.id, title: l.title, kind: l.kind, durationSeconds: l.durationSeconds } : null)

  // Paid content — service role, after the entitlement check.
  let body: string | null = null
  let playback: LessonView['playback'] = null
  let playbackError: LessonView['playbackError'] = null
  const resources: LessonResourceView[] = []

  if (entitled) {
    const { data: content, error } = await admin()
      .from('lesson_contents')
      .select('body, video_asset_id')
      .eq('lesson_id', lesson.id)
      .maybeSingle()
    if (error) throw error
    body = content?.body?.trim() ? content.body : null

    if (kind === 'video' && isVideoProvider(lesson.video_provider)) {
      if (!content?.video_asset_id) {
        playbackError = { code: 'MEDIA_MISSING', message: 'The video for this lesson is not available.' }
      } else {
        try {
          playback = await getPlaybackSource(lesson.video_provider, content.video_asset_id)
        } catch (err) {
          if (err instanceof ApiError && err.code === 'PROVIDER_NOT_CONFIGURED') {
            playbackError = { code: 'PROVIDER_NOT_CONFIGURED', message: err.message }
          } else {
            throw err
          }
        }
      }
    }
  }

  const filePaths = entitled
    ? resourcesRes.data.filter((r) => r.kind === 'file' && r.storage_path).map((r) => r.storage_path as string)
    : []
  const signed = new Map<string, string>()
  if (filePaths.length > 0) {
    const { data: urls, error } = await admin().storage.from('lesson-resources').createSignedUrls(filePaths, RESOURCE_URL_TTL_SECONDS)
    if (error) console.error('[lessons] resource signing failed', error.message)
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl)
  }
  for (const r of resourcesRes.data) {
    if (r.kind === 'link' && r.url) {
      resources.push({ id: r.id, title: r.title, kind: 'link', url: r.url, locked: false })
    } else if (r.kind === 'file') {
      resources.push({
        id: r.id,
        title: r.title,
        kind: 'file',
        url: entitled && r.storage_path ? (signed.get(r.storage_path) ?? null) : null,
        locked: !entitled,
      })
    }
  }

  const threshold = completionThreshold(lesson.duration_seconds, completionRatio)
  const watched = progressRes.data?.watched_seconds ?? 0
  const subjectCode = subject?.code ?? 'math'

  return {
    id: lesson.id,
    title: lesson.title,
    description: lesson.description,
    objectives: (lesson.objectives ?? []).filter((o) => o.trim().length > 0),
    kind,
    durationSeconds: lesson.duration_seconds,
    isFreePreview: lesson.is_free_preview,
    course: {
      id: lesson.courses.id,
      title: lesson.courses.title,
      subjectCode,
      subjectName: subject?.name ?? '',
      href: `/dashboard/courses/${SUBJECT_SLUGS[subjectCode]}`,
    },
    domain: domain ? { id: domain.id, name: domain.name } : null,
    skill: skill ? { id: skill.id, name: skill.name } : null,
    locked: !entitled,
    body,
    playback,
    playbackError,
    resources,
    progress: {
      watchedSeconds: watched,
      lastPositionSeconds: progressRes.data?.last_position_seconds ?? 0,
      completedAt: progressRes.data?.completed_at ?? null,
      thresholdSeconds: threshold,
      canComplete: watched >= threshold,
    },
    completionRatio,
    prev: neighbor(prev),
    next: neighbor(next),
    bookmarked: Boolean(bookmarkRes.data),
    practiceHref: skill && domain ? practiceHref({ subjectCode, domainId: domain.id, skillId: skill.id }) : null,
  }
}
