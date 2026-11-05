import type { Metadata } from 'next'
import { requireRole } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { ADMIN_ROLES } from '@/config/roles'
import { PageHeader, Section } from '@/components/layout/page-header'
import { AssignPlan, PlanEditor, type PlanRow, type WorkspaceRow } from '@/components/admin/workspace-plans'
import { formatDateTime } from '@/features/admin/format'

export const metadata: Metadata = { title: 'Teacher workspaces' }

/** Admins: workspace plans (limits only) and which plan each workspace has. */
export default async function AdminWorkspacesPage() {
  await requireRole(ADMIN_ROLES, { next: '/admin/workspaces' })
  const admin = createAdminSupabase()
  const [plans, workspaces, members, groups] = await Promise.all([
    admin.from('workspace_plans').select('id, code, name, description, max_students, max_groups, live_lessons, is_default, is_active, position').order('position').order('name'),
    admin.from('workspaces').select('id, name, kind, owner_id, plan_id, plan_until, status, created_at').eq('status', 'active').order('created_at', { ascending: false }).limit(200),
    admin.from('workspace_members').select('workspace_id').eq('role', 'student').eq('status', 'active'),
    admin.from('groups').select('workspace_id').eq('status', 'active'),
  ])
  for (const r of [plans, workspaces, members, groups]) if (r.error) throw r.error
  const ownerIds = [...new Set((workspaces.data ?? []).map((w) => w.owner_id))]
  const { data: owners } = ownerIds.length ? await admin.from('profiles').select('id, full_name, email').in('id', ownerIds) : { data: [] }
  const ownerName = new Map((owners ?? []).map((o) => [o.id, o.full_name || o.email]))
  const count = (rows: Array<{ workspace_id: string }>, id: string) => rows.filter((r) => r.workspace_id === id).length
  const planRows = (plans.data ?? []) as PlanRow[]
  const byId = new Map(planRows.map((p) => [p.id, p]))
  const def = planRows.find((p) => p.is_default && p.is_active)
  const nowMs = new Date().getTime()
  const rows: WorkspaceRow[] = (workspaces.data ?? []).map((w) => {
    const assigned = w.plan_id && byId.get(w.plan_id)?.is_active && (!w.plan_until || Date.parse(w.plan_until) > nowMs) ? byId.get(w.plan_id) : undefined
    return {
      id: w.id,
      name: w.name,
      kind: w.kind,
      owner: ownerName.get(w.owner_id) ?? '—',
      students: count(members.data ?? [], w.id),
      groups: count(groups.data ?? [], w.id),
      planId: w.plan_id,
      planUntil: w.plan_until,
      effective: assigned ? assigned.name : def ? `${def.name} (default)` : 'No limits',
    }
  })
  return (
    <>
      <PageHeader
        title="Teacher workspaces"
        description="Plans set limits only (students, active groups, in-app live lessons). There are no prices or online payments for teacher plans yet; assign a plan here after an agreed payment. Every change is audited."
      />
      <div className="space-y-10">
        <Section title="Plans">
          <PlanEditor plans={planRows} />
        </Section>
        <Section title="Workspaces">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active workspaces.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {rows.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-workspace={w.id}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{w.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {w.kind} · {w.owner} · {w.students} students · {w.groups} groups · now: {w.effective}
                      {w.planUntil && ` · until ${formatDateTime(w.planUntil)}`}
                    </p>
                  </div>
                  <AssignPlan workspace={w} plans={planRows} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  )
}
