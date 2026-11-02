'use server'

import { revalidatePath } from 'next/cache'
import { ADMIN_ROLES } from '@/config/roles'
import type { ActionResult } from '@/lib/api/errors'
import { SettingUpdateSchema } from '@/features/content/schemas'
import { adminAction, check } from './server-utils'
import { validateSettingValue } from './settings-values'

/** Saves one platform_settings row with the user-scoped client (RLS: admins may update). */
export async function updateSettingAction(input: { id: string; input: string }): Promise<ActionResult<{ display: string }>> {
  return adminAction(ADMIN_ROLES, async ({ db, profile }) => {
    const parsed = SettingUpdateSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Invalid setting.' }
    const { data: row } = check(await db.from('platform_settings').select('id, key, value').eq('id', parsed.data.id).maybeSingle(), {
      entity: 'setting',
    })
    if (!row) return { ok: false, error: 'This setting no longer exists.' }
    const value = validateSettingValue(row.key, row.value, parsed.data.input)
    if (!value.ok) return { ok: false, error: value.error, fieldErrors: { value: [value.error] } }
    const { data } = check(
      await db.from('platform_settings').update({ value: value.value, updated_by: profile.id }).eq('id', row.id).select('id'),
      { entity: 'setting' },
    )
    if (!data?.length) return { ok: false, error: 'You do not have permission to change settings.' }
    revalidatePath('/admin/settings')
    return { ok: true, data: { display: JSON.stringify(value.value) }, message: 'Saved' }
  })
}
