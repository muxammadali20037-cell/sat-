'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getApiContext } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/api/errors'

const input = z.object({ guideId: z.guid(), read: z.boolean(), slug: z.string().regex(/^[a-z0-9-]{1,80}$/) })

/** Marks a published guide as read / unread for the current student (RLS: own rows, published guides only). */
export async function setGuideReadAction(raw: unknown): Promise<ActionResult<{ read: boolean }>> {
  const parsed = input.safeParse(raw)
  if (!parsed.success) return { ok: false, code: 'VALIDATION_FAILED', error: 'Invalid request.' }
  const { profile } = await getApiContext()
  const db = await createServerSupabase()
  const { guideId, read, slug } = parsed.data

  const { error } = read
    ? await db.from('guide_reads').upsert({ user_id: profile.id, guide_id: guideId }, { onConflict: 'user_id,guide_id', ignoreDuplicates: true })
    : await db.from('guide_reads').delete().eq('user_id', profile.id).eq('guide_id', guideId)
  if (error) {
    console.error('[guides] read mark failed', error.code, error.message)
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Could not save. Try again.' }
  }
  revalidatePath('/dashboard/guides')
  revalidatePath(`/dashboard/guides/${slug}`)
  return { ok: true, data: { read } }
}
