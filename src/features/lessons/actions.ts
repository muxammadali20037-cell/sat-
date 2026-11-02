'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getApiContext } from '@/lib/auth/session'
import { ApiError, type ActionResult } from '@/lib/api/errors'
import { createServerSupabase } from '@/lib/supabase/server'
import { getPublishedLesson } from './server'

const ToggleSchema = z.object({ lessonId: z.uuid(), bookmarked: z.boolean() })

/**
 * Add or remove the current student's bookmark for a published lesson. Uses the user-scoped
 * client: RLS (bookmarks_insert_own / bookmarks_delete_own) limits it to the student's own rows.
 */
export async function setLessonBookmarkAction(input: { lessonId: string; bookmarked: boolean }): Promise<ActionResult<{ bookmarked: boolean }>> {
  const parsed = ToggleSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid request.', code: 'VALIDATION_FAILED' }

  let userId: string
  try {
    userId = (await getApiContext()).user.id
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message, code: err.code }
    throw err
  }

  const db = await createServerSupabase()
  const lesson = await getPublishedLesson(db, parsed.data.lessonId)
  if (!lesson) return { ok: false, error: 'Lesson not found.', code: 'NOT_FOUND' }

  if (parsed.data.bookmarked) {
    const { error } = await db.from('bookmarks').insert({ user_id: userId, lesson_id: lesson.id })
    // 23505 = already bookmarked: the desired state already holds.
    if (error && error.code !== '23505') {
      console.error('[lessons] bookmark insert failed', error.message)
      return { ok: false, error: 'The bookmark could not be saved.' }
    }
  } else {
    const { error } = await db.from('bookmarks').delete().eq('user_id', userId).eq('lesson_id', lesson.id)
    if (error) {
      console.error('[lessons] bookmark delete failed', error.message)
      return { ok: false, error: 'The bookmark could not be removed.' }
    }
  }

  revalidatePath(`/dashboard/lesson/${lesson.id}`)
  revalidatePath('/dashboard/bookmarks')
  return { ok: true, data: { bookmarked: parsed.data.bookmarked } }
}
