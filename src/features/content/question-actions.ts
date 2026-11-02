'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { CONTENT_ROLES, STAFF_ROLES, hasRole } from '@/config/roles'
import type { ActionResult } from '@/lib/api/errors'
import { adminAction, check } from '@/features/admin/server-utils'
import { issuesToFieldErrors, summarizeFieldErrors } from './form-errors'
import { QuestionInputSchema } from './question-schema'
import { duplicateQuestion, questionStatus, saveQuestion } from './questions-server'
import { QUESTION_STATUS_LABELS } from './constants'

function revalidateQuestion(id?: string) {
  revalidatePath('/admin/questions')
  revalidatePath('/admin')
  if (id) revalidatePath(`/admin/questions/${id}`)
}

export async function saveQuestionAction(input: unknown, id?: string | null): Promise<ActionResult<{ id: string }>> {
  return adminAction(CONTENT_ROLES, async ({ db }) => {
    if (id && !z.guid().safeParse(id).success) return { ok: false, error: 'Invalid question id.' }
    const parsed = QuestionInputSchema.safeParse(input)
    if (!parsed.success) {
      const fieldErrors = issuesToFieldErrors(parsed.error.issues)
      return { ok: false, error: summarizeFieldErrors(fieldErrors), code: 'VALIDATION_FAILED', fieldErrors }
    }
    const saved = await saveQuestion(db, parsed.data, id)
    revalidateQuestion(saved.id)
    return { ok: true, data: { id: saved.id }, message: id ? 'Saved' : 'Draft saved' }
  })
}

const StatusSchema = z.object({ id: z.guid(), status: z.enum(['draft', 'reviewed', 'published', 'archived']) })

/**
 * Review workflow via public.question_set_status. Teachers may only mark reviewed (also enforced
 * in SQL); publishing requires a reviewed question.
 */
export async function setQuestionStatusAction(id: string, status: string): Promise<ActionResult> {
  return adminAction(STAFF_ROLES, async ({ db, profile }) => {
    const parsed = StatusSchema.safeParse({ id, status })
    if (!parsed.success) return { ok: false, error: 'Invalid status change.' }
    if (parsed.data.status !== 'reviewed' && !hasRole(profile.role, CONTENT_ROLES)) {
      return { ok: false, error: 'Only content editors and admins can publish, unpublish or archive.', code: 'FORBIDDEN' }
    }
    const current = await questionStatus(db, parsed.data.id)
    if (!current) return { ok: false, error: 'This question no longer exists.' }
    if (parsed.data.status === 'published' && current === 'draft') {
      return { ok: false, error: 'Mark the question as reviewed before publishing.' }
    }
    check(await db.rpc('question_set_status', { p_question_id: parsed.data.id, p_status: parsed.data.status }), { entity: 'question' })
    revalidateQuestion(parsed.data.id)
    const verb = { draft: 'Moved to draft', reviewed: 'Marked reviewed', published: 'Published', archived: 'Archived' }[parsed.data.status]
    return { ok: true, message: verb ?? QUESTION_STATUS_LABELS[parsed.data.status] }
  })
}

export async function duplicateQuestionAction(id: string): Promise<ActionResult<{ id: string }>> {
  return adminAction(CONTENT_ROLES, async ({ db }) => {
    if (!z.guid().safeParse(id).success) return { ok: false, error: 'Invalid question id.' }
    const newId = await duplicateQuestion(db, id)
    revalidateQuestion(newId)
    return { ok: true, data: { id: newId }, message: 'Duplicated as a new draft' }
  })
}
