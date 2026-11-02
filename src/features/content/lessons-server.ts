import 'server-only'
import type { Db } from '@/lib/supabase/server'
import { DbActionError } from '@/features/admin/server-utils'
import { isContentStatus, type ContentStatus, type VideoProvider } from './constants'
import { lessonRows, type LessonInput, type LessonInputRaw } from './schemas'

const LESSON_ERR = { entity: 'lesson', duplicate: 'This course already has a lesson with this slug.' }

/** Creates lesson + lesson_contents with the user-scoped client (RLS: content managers). */
export async function createLesson(db: Db, input: LessonInput, createdBy: string): Promise<string> {
  const rows = lessonRows(input)
  const { data, error } = await db
    .from('lessons')
    .insert({ ...rows.lesson, status: 'draft', created_by: createdBy })
    .select('id')
    .single()
  if (error) throw new DbActionError(error, LESSON_ERR)
  const contents = await db.from('lesson_contents').insert({ lesson_id: data.id, ...rows.content })
  if (contents.error) {
    // Keep create atomic from the editor's point of view: a fresh draft has no references yet.
    await db.from('lessons').delete().eq('id', data.id)
    throw new DbActionError(contents.error, LESSON_ERR)
  }
  return data.id
}

export async function updateLesson(db: Db, id: string, input: LessonInput): Promise<void> {
  const rows = lessonRows(input)
  const updated = await db.from('lessons').update(rows.lesson).eq('id', id).select('id')
  if (updated.error) throw new DbActionError(updated.error, LESSON_ERR)
  if (!updated.data?.length) throw new DbActionError({ code: 'P0002', message: 'Lesson not found' })
  const contents = await db.from('lesson_contents').upsert({ lesson_id: id, ...rows.content }, { onConflict: 'lesson_id' })
  if (contents.error) throw new DbActionError(contents.error, LESSON_ERR)
}

export type EditorLesson = {
  id: string
  status: ContentStatus
  input: LessonInputRaw
  publishedAt: string | null
  archivedAt: string | null
  updatedAt: string
  createdAt: string
  resources: Array<{ id: string; title: string; kind: 'link' | 'file'; url: string | null; storagePath: string | null; position: number }>
  progress: { learners: number; completions: number }
}

export async function loadLessonForEditor(db: Db, id: string): Promise<EditorLesson | null> {
  const [lesson, content, resources, learners, completions] = await Promise.all([
    db.from('lessons').select('*').eq('id', id).maybeSingle(),
    db.from('lesson_contents').select('body, video_asset_id').eq('lesson_id', id).maybeSingle(),
    db.from('lesson_resources').select('id, title, kind, url, storage_path, position').eq('lesson_id', id).order('position').order('created_at'),
    db.from('lesson_progress').select('id', { count: 'exact', head: true }).eq('lesson_id', id),
    db.from('lesson_progress').select('id', { count: 'exact', head: true }).eq('lesson_id', id).not('completed_at', 'is', null),
  ])
  if (lesson.error) throw new DbActionError(lesson.error, LESSON_ERR)
  if (!lesson.data) return null
  if (content.error) throw new DbActionError(content.error, LESSON_ERR)
  if (resources.error) throw new DbActionError(resources.error, LESSON_ERR)
  const l = lesson.data
  return {
    id: l.id,
    status: isContentStatus(l.status) ? l.status : 'draft',
    publishedAt: l.published_at,
    archivedAt: l.archived_at,
    updatedAt: l.updated_at,
    createdAt: l.created_at,
    input: {
      course_id: l.course_id,
      skill_id: l.skill_id ?? '',
      slug: l.slug,
      title: l.title,
      description: l.description,
      objectives: l.objectives ?? [],
      position: l.position,
      duration_minutes: Math.round((l.duration_seconds / 60) * 10) / 10,
      is_free_preview: l.is_free_preview,
      body: content.data?.body ?? '',
      video_provider: l.video_provider as VideoProvider,
      video_asset_id: content.data?.video_asset_id ?? '',
    },
    resources: (resources.data ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      kind: r.kind === 'file' ? 'file' : 'link',
      url: r.url,
      storagePath: r.storage_path,
      position: r.position,
    })),
    // Learner counts only resolve for roles that can view students (RLS); others see 0 → hidden.
    progress: { learners: learners.count ?? 0, completions: completions.count ?? 0 },
  }
}
