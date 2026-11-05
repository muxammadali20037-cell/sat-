'use server'

import { revalidatePath } from 'next/cache'
import { ADMIN_ROLES } from '@/config/roles'
import type { ActionResult } from '@/lib/api/errors'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { writeAudit } from '@/lib/audit'
import { adminAction, check } from './server-utils'
import { AssignPlanSchema, PlanSchema } from '@/features/classroom/plans'

/**
 * Workspace plans (limits only, no prices) and assigning them to workspaces. Admins only; every
 * change is audited with the acting admin. This is the "trusted administrative process" until a
 * payment provider is confirmed for teacher plans.
 */

const refresh = () => {
  revalidatePath('/admin/workspaces')
  revalidatePath('/teach', 'layout')
}

export async function saveWorkspacePlanAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return adminAction(ADMIN_ROLES, async ({ profile }) => {
    const parsed = PlanSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Check the plan fields.' }
    const d = parsed.data
    const admin = createAdminSupabase()
    if (d.isDefault) {
      // Only one default plan: clear the flag elsewhere first.
      check(await admin.from('workspace_plans').update({ is_default: false }).eq('is_default', true).neq('id', d.id ?? '00000000-0000-0000-0000-000000000000'))
    }
    const row = {
      code: d.code,
      name: d.name,
      description: d.description,
      max_students: d.maxStudents,
      max_groups: d.maxGroups,
      live_lessons: d.liveLessons,
      is_default: d.isDefault && d.isActive,
      is_active: d.isActive,
      position: d.position,
    }
    let id = d.id
    if (id) {
      const { data } = check(await admin.from('workspace_plans').update(row).eq('id', id).select('id'), { entity: 'plan' })
      if (!data?.length) return { ok: false, error: 'This plan no longer exists.' }
    } else {
      const { data } = check(await admin.from('workspace_plans').insert(row).select('id').single(), { entity: 'plan' })
      id = data!.id
    }
    await writeAudit({ actorId: profile.id, actorRole: profile.role, action: d.id ? 'workspace_plan.update' : 'workspace_plan.create', entityType: 'workspace_plan', entityId: id, after: row })
    refresh()
    return { ok: true, data: { id: id! }, message: 'Plan saved' }
  })
}

export async function assignWorkspacePlanAction(input: unknown): Promise<ActionResult> {
  return adminAction(ADMIN_ROLES, async ({ profile }) => {
    const parsed = AssignPlanSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Check the fields.' }
    const d = parsed.data
    const admin = createAdminSupabase()
    const { data: ws } = check(await admin.from('workspaces').select('id, plan_id, plan_until').eq('id', d.workspaceId).maybeSingle(), { entity: 'workspace' })
    if (!ws) return { ok: false, error: 'This workspace no longer exists.' }
    if (d.planId) {
      const { data: plan } = check(await admin.from('workspace_plans').select('id, is_active').eq('id', d.planId).maybeSingle(), { entity: 'plan' })
      if (!plan?.is_active) return { ok: false, error: 'Choose an active plan.' }
    }
    if (d.until && Date.parse(d.until) <= Date.now()) return { ok: false, error: 'The end date must be in the future.' }
    check(await admin.from('workspaces').update({ plan_id: d.planId, plan_until: d.planId ? d.until : null }).eq('id', d.workspaceId), { entity: 'workspace' })
    await writeAudit({
      actorId: profile.id,
      actorRole: profile.role,
      action: 'workspace.plan_assign',
      entityType: 'workspace',
      entityId: d.workspaceId,
      workspaceId: d.workspaceId,
      summary: d.note,
      before: { plan_id: ws.plan_id, plan_until: ws.plan_until },
      after: { plan_id: d.planId, plan_until: d.planId ? d.until : null },
    })
    refresh()
    return { ok: true, message: d.planId ? 'Plan assigned' : 'Plan removed' }
  })
}
