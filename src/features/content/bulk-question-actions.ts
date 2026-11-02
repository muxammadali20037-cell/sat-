'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { CONTENT_ROLES, STAFF_ROLES, hasRole } from '@/config/roles'
import type { ActionResult } from '@/lib/api/errors'
import { adminAction } from '@/features/admin/server-utils'

const input = z.object({
  ids: z.array(z.guid()).min(1, 'Select at least one question.').max(100, 'Select at most 100 questions at a time.'),
  status: z.enum(['reviewed', 'published', 'draft', 'archived']),
})

/** The status a question must currently have for each bulk transition (the same rules as the editor). */
const ALLOWED_FROM: Record<string, readonly string[]> = {
  reviewed: ['draft'],
  published: ['reviewed'],
  draft: ['reviewed', 'published', 'archived'],
  archived: ['draft', 'reviewed', 'published'],
}

/**
 * Bulk review workflow for the question bank. Each question goes through public.question_set_status,
 * so role checks, completeness checks and the audit trail are exactly those of the single editor.
 * Questions that are not in an allowed state, or fail a check, are skipped and counted.
 */
export async function bulkSetQuestionStatusAction(ids: unknown, status: unknown): Promise<ActionResult<{ changed: number; skipped: number; failures: string[] }>> {
  return adminAction(STAFF_ROLES, async ({ db, profile }) => {
    const parsed = input.safeParse({ ids, status })
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request.', code: 'VALIDATION_FAILED' }
    const { ids: list, status: target } = parsed.data
    if (target !== 'reviewed' && !hasRole(profile.role, CONTENT_ROLES)) {
      return { ok: false, error: 'Only content editors and admins can publish, unpublish or archive.', code: 'FORBIDDEN' }
    }

    const { data: rows, error } = await db.from('questions').select('id, status').in('id', [...new Set(list)])
    if (error) return { ok: false, error: 'Could not load the selected questions.' }

    let changed = 0
    let skipped = 0
    const failures: string[] = []
    for (const row of rows ?? []) {
      if (!ALLOWED_FROM[target]!.includes(row.status)) {
        skipped++
        continue
      }
      const res = await db.rpc('question_set_status', { p_question_id: row.id, p_status: target })
      if (res.error) {
        skipped++
        if (failures.length < 5) failures.push(res.error.message)
      } else changed++
    }
    skipped += list.length - (rows?.length ?? 0)

    revalidatePath('/admin/questions')
    revalidatePath('/admin')
    const verb = { reviewed: 'Marked reviewed', published: 'Published', draft: 'Moved to draft', archived: 'Archived' }[target]
    return {
      ok: true,
      data: { changed, skipped, failures },
      message: `${verb}: ${changed}${skipped ? ` · skipped ${skipped} (not in the right state${failures.length ? ' or failed a check' : ''})` : ''}`,
    }
  })
}
