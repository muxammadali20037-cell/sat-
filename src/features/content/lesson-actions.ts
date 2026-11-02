'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { CONTENT_ROLES } from '@/config/roles'
import type { ActionResult } from '@/lib/api/errors'
import { createAdminSupabase } from '@/lib/supabase/admin'
import type { Db } from '@/lib/supabase/server'
import { adminAction, check } from '@/features/admin/server-utils'
import { issuesToFieldErrors, summarizeFieldErrors } from './form-errors'
import { LESSON_FILE_PATH_RE, LIMITS } from './constants'
import { LessonInputSchema, LessonResourceLinkSchema } from './schemas'
import { createLesson, updateLesson } from './lessons-server'

function revalidateLesson(id?: string) {
  revalidatePath('/admin/lessons')
  revalidatePath('/admin/courses')
  revalidatePath('/admin')
  if (id) revalidatePath(`/admin/lessons/${id}`)
}

export async function saveLessonAction(input: unknown, id?: string | null): Promise<ActionResult<{ id: string }>> {
  return adminAction(CONTENT_ROLES, async ({ db, profile }) => {
    const parsed = LessonInputSchema.safeParse(input)
    if (!parsed.success) {
      const fieldErrors = issuesToFieldErrors(parsed.error.issues)
      return { ok: false, error: summarizeFieldErrors(fieldErrors), code: 'VALIDATION_FAILED', fieldErrors }
    }
    if (id) {
      if (!z.guid().safeParse(id).success) return { ok: false, error: 'Invalid lesson.' }
      await updateLesson(db, id, parsed.data)
      revalidateLesson(id)
      return { ok: true, data: { id }, message: 'Saved' }
    }
    const newId = await createLesson(db, parsed.data, profile.id)
    revalidateLesson(newId)
    return { ok: true, data: { id: newId }, message: 'Lesson created' }
  })
}

/** Publish / unpublish / archive. The DB guard requires media or ≥ 50 characters of notes. */
export async function setLessonStatus(id: string, status: string): Promise<ActionResult> {
  return adminAction(CONTENT_ROLES, async ({ db }) => {
    const parsed = z.object({ id: z.guid(), status: z.enum(['draft', 'published', 'archived']) }).safeParse({ id, status })
    if (!parsed.success) return { ok: false, error: 'Invalid status change.' }
    const { data } = check(await db.from('lessons').update({ status: parsed.data.status }).eq('id', parsed.data.id).select('id'), {
      entity: 'lesson',
    })
    if (!data?.length) return { ok: false, error: 'This lesson no longer exists.' }
    revalidateLesson(parsed.data.id)
    return { ok: true, message: { draft: 'Unpublished', published: 'Published', archived: 'Archived' }[parsed.data.status] }
  })
}

export async function deleteLesson(id: string): Promise<ActionResult> {
  return adminAction(CONTENT_ROLES, async ({ db }) => {
    if (!z.guid().safeParse(id).success) return { ok: false, error: 'Invalid lesson.' }
    const { data: lesson } = check(await db.from('lessons').select('status').eq('id', id).maybeSingle(), { entity: 'lesson' })
    if (!lesson) return { ok: false, error: 'This lesson no longer exists.' }
    if (lesson.status !== 'draft') return { ok: false, error: 'Only draft lessons can be deleted. Archive published lessons instead.' }
    const progress = await db.from('lesson_progress').select('id', { count: 'exact', head: true }).eq('lesson_id', id)
    if ((progress.count ?? 0) > 0) return { ok: false, error: 'Students have progress on this lesson. Archive it instead.' }
    check(await db.from('lessons').delete().eq('id', id), { entity: 'lesson' })
    revalidateLesson()
    return { ok: true, message: 'Lesson deleted' }
  })
}

async function nextPosition(db: Db, lessonId: string) {
  const { count } = await db.from('lesson_resources').select('id', { count: 'exact', head: true }).eq('lesson_id', lessonId)
  return count ?? 0
}

export async function addLessonLink(input: unknown): Promise<ActionResult> {
  return adminAction(CONTENT_ROLES, async ({ db }) => {
    const parsed = LessonResourceLinkSchema.safeParse(input)
    if (!parsed.success) {
      const fieldErrors = issuesToFieldErrors(parsed.error.issues)
      return { ok: false, error: summarizeFieldErrors(fieldErrors), fieldErrors }
    }
    const position = await nextPosition(db, parsed.data.lesson_id)
    check(
      await db.from('lesson_resources').insert({ lesson_id: parsed.data.lesson_id, title: parsed.data.title, kind: 'link', url: parsed.data.url, position }),
      { entity: 'resource' },
    )
    revalidateLesson(parsed.data.lesson_id)
    return { ok: true, message: 'Link added' }
  })
}

const FileResourceSchema = z.object({
  lesson_id: z.guid(),
  title: z.string().trim().min(1, 'Give the resource a title.').max(LIMITS.resourceTitle),
  path: z.string().regex(LESSON_FILE_PATH_RE),
})

/** Records a file that finalizeUpload already verified in the lesson-resources bucket. */
export async function addLessonFile(input: unknown): Promise<ActionResult> {
  return adminAction(CONTENT_ROLES, async ({ db }) => {
    const parsed = FileResourceSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Invalid file resource.' }
    if (!parsed.data.path.startsWith(`lessons/${parsed.data.lesson_id}/`)) return { ok: false, error: 'This file belongs to another lesson.' }
    const position = await nextPosition(db, parsed.data.lesson_id)
    check(
      await db
        .from('lesson_resources')
        .insert({ lesson_id: parsed.data.lesson_id, title: parsed.data.title, kind: 'file', storage_path: parsed.data.path, position }),
      { entity: 'resource' },
    )
    revalidateLesson(parsed.data.lesson_id)
    return { ok: true, message: 'File added' }
  })
}

export async function deleteLessonResource(id: string): Promise<ActionResult> {
  return adminAction(CONTENT_ROLES, async ({ db }) => {
    if (!z.guid().safeParse(id).success) return { ok: false, error: 'Invalid resource.' }
    const { data } = check(await db.from('lesson_resources').delete().eq('id', id).select('lesson_id, kind, storage_path'), { entity: 'resource' })
    const row = data?.[0]
    if (!row) return { ok: false, error: 'This resource no longer exists.' }
    if (row.kind === 'file' && row.storage_path && LESSON_FILE_PATH_RE.test(row.storage_path)) {
      const { error } = await createAdminSupabase().storage.from('lesson-resources').remove([row.storage_path])
      if (error) console.error('[lessons] resource row deleted but storage object remains', row.storage_path, error)
    }
    revalidateLesson(row.lesson_id)
    return { ok: true, message: 'Resource removed' }
  })
}
