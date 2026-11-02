'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ADMIN_ROLES, ROLES, ROLE_LABELS, canAssignRole, isRole } from '@/config/roles'
import { writeAudit } from '@/lib/audit'
import type { ActionResult } from '@/lib/api/errors'
import { adminAction, check } from './server-utils'

const RoleChangeSchema = z.object({ userId: z.guid(), role: z.enum(ROLES) })
const SuspendSchema = z.object({ userId: z.guid(), suspended: z.boolean() })

/** Role change through public.admin_set_user_role (hierarchy enforced again in SQL). */
export async function changeUserRole(input: { userId: string; role: string }): Promise<ActionResult> {
  return adminAction(ADMIN_ROLES, async ({ profile, db }) => {
    const parsed = RoleChangeSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Choose a valid role.' }
    const { userId, role } = parsed.data
    if (userId === profile.id) return { ok: false, error: 'You cannot change your own role.' }

    const { data: target } = check(await db.from('profiles').select('id, email, role').eq('id', userId).maybeSingle(), { entity: 'user' })
    if (!target) return { ok: false, error: 'This user no longer exists.' }
    const current = isRole(target.role) ? target.role : 'STUDENT'
    if (current === role) return { ok: true, message: 'No change.' }
    if (!canAssignRole(profile.role, current, role)) {
      return { ok: false, error: `Your role cannot change a ${ROLE_LABELS[current].toLowerCase()} to ${ROLE_LABELS[role].toLowerCase()}.` }
    }

    check(await db.rpc('admin_set_user_role', { p_user_id: userId, p_role: role }), { entity: 'user' })
    await writeAudit({
      actorId: profile.id,
      actorRole: profile.role,
      action: 'user.role_change',
      entityType: 'profile',
      entityId: userId,
      summary: `${target.email}: ${ROLE_LABELS[current]} → ${ROLE_LABELS[role]}`,
      before: { role: current },
      after: { role },
    })
    revalidatePath('/admin/students')
    revalidatePath(`/admin/students/${userId}`)
    return { ok: true, message: `Role changed to ${ROLE_LABELS[role]}.` }
  })
}

export async function setUserSuspended(input: { userId: string; suspended: boolean }): Promise<ActionResult> {
  return adminAction(ADMIN_ROLES, async ({ profile, db }) => {
    const parsed = SuspendSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Invalid request.' }
    const { userId, suspended } = parsed.data
    if (userId === profile.id) return { ok: false, error: 'You cannot suspend yourself.' }
    check(await db.rpc('admin_set_user_suspended', { p_user_id: userId, p_suspended: suspended }), { entity: 'user' })
    revalidatePath('/admin/students')
    revalidatePath(`/admin/students/${userId}`)
    return { ok: true, message: suspended ? 'Account suspended.' : 'Account reactivated.' }
  })
}
