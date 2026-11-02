'use server'

import { z } from 'zod'
import { CONTENT_ROLES } from '@/config/roles'
import type { ActionResult } from '@/lib/api/errors'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { adminAction, check } from '@/features/admin/server-utils'
import { LESSON_FILE_PATH_RE, QUESTION_IMAGE_PATH_RE, UPLOAD_RULES, checkUploadFile, type UploadPurpose } from './constants'

/**
 * Two-step uploads to the private buckets. Files never pass through a server action body (1 MB
 * limit; videos are up to 500 MB):
 *   1. createUploadTarget — authorizes the editor, validates type/size, mints a server-chosen path
 *      and a one-time signed upload token with the service role.
 *   2. The browser PUTs the file to that signed URL (storage enforces bucket size/MIME limits).
 *   3. finalizeUpload — re-checks the stored object's real size and type; deletes it if invalid.
 */

const PurposeSchema = z.enum(['question_image', 'lesson_video', 'lesson_resource'])
const TargetSchema = z.object({
  purpose: PurposeSchema,
  contentType: z.string().max(100),
  size: z.number().int().positive(),
  lessonId: z.guid().optional(),
})

function pathRe(purpose: UploadPurpose) {
  return purpose === 'question_image' ? QUESTION_IMAGE_PATH_RE : LESSON_FILE_PATH_RE
}

export async function createUploadTarget(input: {
  purpose: UploadPurpose
  contentType: string
  size: number
  lessonId?: string
}): Promise<ActionResult<{ bucket: string; path: string; token: string }>> {
  return adminAction(CONTENT_ROLES, async ({ db }) => {
    const parsed = TargetSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Invalid upload request.' }
    const { purpose, contentType, size, lessonId } = parsed.data
    const problem = checkUploadFile(purpose, { type: contentType, size })
    if (problem) return { ok: false, error: problem }
    const rule = UPLOAD_RULES[purpose]
    const ext = rule.types[contentType]!

    let path: string
    if (purpose === 'question_image') {
      path = `questions/${crypto.randomUUID()}.${ext}`
    } else {
      if (!lessonId) return { ok: false, error: 'Save the lesson before uploading files.' }
      const { data: lesson } = check(await db.from('lessons').select('id').eq('id', lessonId).maybeSingle(), { entity: 'lesson' })
      if (!lesson) return { ok: false, error: 'This lesson no longer exists.' }
      path = `lessons/${lessonId}/${crypto.randomUUID()}.${ext}`
    }

    const admin = createAdminSupabase()
    const { data, error } = await admin.storage.from(rule.bucket).createSignedUploadUrl(path)
    if (error || !data) {
      console.error('[upload] could not create signed upload url', error)
      return { ok: false, error: 'Storage is not available right now. Try again in a moment.', code: 'SERVICE_NOT_CONFIGURED' }
    }
    return { ok: true, data: { bucket: rule.bucket, path: data.path, token: data.token } }
  })
}

export async function finalizeUpload(input: { purpose: UploadPurpose; path: string }): Promise<ActionResult<{ path: string; previewUrl: string | null }>> {
  return adminAction(CONTENT_ROLES, async () => {
    const purpose = PurposeSchema.safeParse(input.purpose)
    if (!purpose.success || typeof input.path !== 'string' || !pathRe(purpose.data).test(input.path)) {
      return { ok: false, error: 'Invalid upload.' }
    }
    const rule = UPLOAD_RULES[purpose.data]
    const admin = createAdminSupabase()
    const bucket = admin.storage.from(rule.bucket)
    const { data: info, error } = await bucket.info(input.path)
    if (error || !info) return { ok: false, error: 'The upload did not complete. Try again.' }
    const size = Number(info.size ?? 0)
    const type = String(info.contentType ?? '')
    const problem = checkUploadFile(purpose.data, { type, size })
    if (problem) {
      await bucket.remove([input.path])
      return { ok: false, error: problem }
    }
    let previewUrl: string | null = null
    if (purpose.data === 'question_image') {
      const signed = await bucket.createSignedUrl(input.path, 60 * 60)
      previewUrl = signed.data?.signedUrl ?? null
    }
    return { ok: true, data: { path: input.path, previewUrl } }
  })
}

/** Short-lived URL so editors can check an uploaded video or resource. */
export async function getStaffMediaUrl(input: { purpose: UploadPurpose; path: string }): Promise<ActionResult<{ url: string }>> {
  return adminAction(CONTENT_ROLES, async () => {
    const purpose = PurposeSchema.safeParse(input.purpose)
    if (!purpose.success || !pathRe(purpose.data).test(input.path)) return { ok: false, error: 'Invalid file.' }
    const { data, error } = await createAdminSupabase().storage.from(UPLOAD_RULES[purpose.data].bucket).createSignedUrl(input.path, 15 * 60)
    if (error || !data) return { ok: false, error: 'The file could not be found in storage.' }
    return { ok: true, data: { url: data.signedUrl } }
  })
}
