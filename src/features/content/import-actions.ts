'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { CONTENT_ROLES } from '@/config/roles'
import type { ActionResult } from '@/lib/api/errors'
import { writeAudit } from '@/lib/audit'
import { getTaxonomy } from '@/features/taxonomy/server'
import { adminAction } from '@/features/admin/server-utils'
import { DbActionError } from '@/features/admin/server-utils'
import { mapDbError } from '@/features/admin/db-errors'
import { IMPORT_MAX_CHARS, buildImportReport } from './question-import'
import { upsertQuestionRpc } from './questions-server'

export type ImportOutcome = {
  created: Array<{ row: number; id: string }>
  failed: Array<{ row: number; error: string }>
  skippedInvalid: number
}

const InputSchema = z.object({
  text: z.string().min(1, 'Nothing to import.').max(IMPORT_MAX_CHARS, 'The file is too large.'),
  format: z.enum(['csv', 'json', 'auto']).default('auto'),
  fileName: z.string().max(200).optional(),
})

const CONCURRENCY = 4

/**
 * Re-validates the whole file on the server with the live taxonomy (never trusts the browser's
 * dry run), then saves each valid row as a DRAFT through admin_upsert_question.
 */
export async function importQuestionsAction(input: { text: string; format?: 'csv' | 'json' | 'auto'; fileName?: string }): Promise<ActionResult<ImportOutcome>> {
  return adminAction(CONTENT_ROLES, async ({ db, profile }) => {
    const parsed = InputSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid import.' }
    const taxonomy = await getTaxonomy(db)
    const report = buildImportReport(parsed.data.text, taxonomy, parsed.data.format)
    if (report.fileErrors.length > 0) return { ok: false, error: report.fileErrors.join(' ') }
    const valid = report.rows.filter((r) => r.ok)
    if (valid.length === 0) return { ok: false, error: 'No valid rows to import. Fix the errors shown in the preview.' }

    const created: ImportOutcome['created'] = []
    const failed: ImportOutcome['failed'] = []
    for (let i = 0; i < valid.length; i += CONCURRENCY) {
      const batch = valid.slice(i, i + CONCURRENCY)
      const results = await Promise.allSettled(batch.map((r) => upsertQuestionRpc(db, { ...r.payload, status: 'draft' })))
      results.forEach((res, j) => {
        const row = batch[j]!.row
        if (res.status === 'fulfilled') created.push({ row, id: res.value })
        else {
          const err = res.reason
          if (!(err instanceof DbActionError)) console.error('[import] unexpected error', err)
          failed.push({ row, error: err instanceof DbActionError ? err.message : mapDbError(null) })
        }
      })
    }

    await writeAudit({
      actorId: profile.id,
      actorRole: profile.role,
      action: 'question.import',
      entityType: 'question',
      summary: `Imported ${created.length} draft question${created.length === 1 ? '' : 's'} (${failed.length} failed, ${report.invalidCount} invalid rows skipped) from ${parsed.data.fileName || `pasted ${report.format.toUpperCase()}`}`,
      after: {
        format: report.format,
        file: parsed.data.fileName ?? null,
        created: created.length,
        failed: failed.slice(0, 50),
        skipped_invalid: report.invalidCount,
        question_ids: created.slice(0, 500).map((c) => c.id),
      },
    })
    revalidatePath('/admin/questions')
    revalidatePath('/admin')
    return {
      ok: true,
      data: { created, failed, skippedInvalid: report.invalidCount },
      message: `Imported ${created.length} question${created.length === 1 ? '' : 's'} as drafts`,
    }
  })
}
