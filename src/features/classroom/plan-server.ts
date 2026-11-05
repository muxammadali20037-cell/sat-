import 'server-only'
import type { Db } from '@/lib/supabase/server'
import type { PlanUsage, WorkspacePlanLimits } from './plans'

/** The plan that applies to a workspace right now (assigned and valid, else the default, else none). */
export async function effectivePlan(admin: Db, workspaceId: string): Promise<{ plan: WorkspacePlanLimits | null; source: PlanUsage['source']; until: string | null }> {
  const [{ data: rows, error }, { data: ws, error: e2 }] = await Promise.all([
    admin.rpc('workspace_effective_plan', { p_workspace: workspaceId }),
    admin.from('workspaces').select('plan_id, plan_until').eq('id', workspaceId).maybeSingle(),
  ])
  if (error) throw error
  if (e2) throw e2
  const p = rows?.[0]
  if (!p) return { plan: null, source: 'none', until: null }
  const assigned = ws?.plan_id === p.id && (!ws.plan_until || Date.parse(ws.plan_until) > Date.now())
  return {
    plan: { id: p.id, code: p.code, name: p.name, maxStudents: p.max_students, maxGroups: p.max_groups, liveLessons: p.live_lessons },
    source: assigned ? 'assigned' : 'default',
    until: assigned ? (ws?.plan_until ?? null) : null,
  }
}

export async function planUsage(admin: Db, workspaceId: string): Promise<PlanUsage> {
  const [eff, students, groups] = await Promise.all([
    effectivePlan(admin, workspaceId),
    admin.from('workspace_members').select('user_id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('role', 'student').eq('status', 'active'),
    admin.from('groups').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'active'),
  ])
  if (students.error) throw students.error
  if (groups.error) throw groups.error
  return { ...eff, students: students.count ?? 0, groups: groups.count ?? 0 }
}
