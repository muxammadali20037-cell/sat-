import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { requireRole } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { ADMIN_ROLES } from '@/config/roles'
import { PageHeader } from '@/components/layout/page-header'
import { Pagination } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/states'
import { Badge } from '@/components/ui/card'
import { FilterBar, FilterInput } from '@/components/admin/filter-bar'
import { AuditDiffView } from '@/components/admin/audit-diff-view'
import { DbActionError, profileNames } from '@/features/admin/server-utils'
import { buildHref, dateParam, pageFromParam, param, sanitizeSearch } from '@/features/admin/params'
import { localMidnightIso } from '@/features/admin/series'
import { formatDateTime } from '@/features/admin/format'
import { addDays } from '@/lib/time'
import { formatNumber } from '@/lib/utils'
import type { Json } from '@/types/database'

export const metadata: Metadata = { title: 'Audit log' }
const PAGE_SIZE = 50

export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(ADMIN_ROLES, { next: '/admin/audit-logs' })
  const sp = await searchParams
  const action = param(sp.action).trim().replace(/[^a-z0-9_.]/gi, '').slice(0, 80)
  const entity = param(sp.entity).trim().replace(/[^a-z0-9_]/gi, '').slice(0, 60)
  const actor = sanitizeSearch(param(sp.actor))
  const from = dateParam(sp.from)
  const to = dateParam(sp.to)
  const page = pageFromParam(sp.page)
  const db = await createServerSupabase()

  let actorIds: string[] | null = null
  if (actor) {
    const { data, error } = await db.from('profiles').select('id').ilike('email', `%${actor}%`).limit(100)
    if (error) throw new DbActionError(error)
    actorIds = (data ?? []).map((p) => p.id)
  }

  let rows: Array<{
    id: string
    action: string
    entity_type: string
    entity_id: string | null
    summary: string
    actor_id: string | null
    actor_role: string | null
    before_data: Json | null
    after_data: Json | null
    ip_address: string | null
    created_at: string
  }> = []
  let total = 0
  if (actorIds === null || actorIds.length > 0) {
    let q = db
      .from('audit_logs')
      .select('id, action, entity_type, entity_id, summary, actor_id, actor_role, before_data, after_data, ip_address, created_at', { count: 'exact' })
    if (action) q = q.ilike('action', `${action}%`)
    if (entity) q = q.eq('entity_type', entity)
    if (actorIds) q = q.in('actor_id', actorIds)
    if (from) q = q.gte('created_at', localMidnightIso(from))
    if (to) q = q.lt('created_at', localMidnightIso(addDays(to, 1)))
    const offset = (page - 1) * PAGE_SIZE
    const res = await q.order('created_at', { ascending: false }).order('id').range(offset, offset + PAGE_SIZE - 1)
    if (res.error) throw new DbActionError(res.error)
    rows = res.data ?? []
    total = res.count ?? 0
  }
  const names = await profileNames(db, rows.map((r) => r.actor_id))
  const filtered = Boolean(action || entity || actor || from || to)

  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of content, role, settings and billing changes. Entries cannot be edited or deleted." />
      <FilterBar action="/admin/audit-logs" resetHref="/admin/audit-logs">
        <FilterInput name="action" label="Action starts with" defaultValue={action} placeholder="questions.update" />
        <FilterInput name="entity" label="Entity type" defaultValue={entity} placeholder="questions" />
        <FilterInput name="actor" label="Actor email" defaultValue={actor} placeholder="name@example.com" />
        <FilterInput name="from" label="From" type="date" defaultValue={from} />
        <FilterInput name="to" label="To" type="date" defaultValue={to} />
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          title={filtered ? 'No entries match these filters' : 'No audit entries yet'}
          description={filtered ? (actorIds?.length === 0 ? 'No account matches that email.' : 'Widen the date range or reset the filters.') : 'Changes to content, roles, settings and billing are recorded automatically.'}
          action={
            filtered ? (
              <Link href="/admin/audit-logs" className="text-sm font-medium text-primary hover:underline">
                Reset filters
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {rows.map((r) => {
            const who = r.actor_id ? names.get(r.actor_id) : null
            return (
              <li key={r.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
                    <code className="rounded bg-muted px-1.5 py-0.5 text-[12px]">{r.action}</code>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {r.summary || (
                        <span className="text-muted-foreground">
                          {r.entity_type}
                          {r.entity_id ? ` · ${r.entity_id}` : ''}
                        </span>
                      )}
                    </span>
                    <span className="text-[13px] text-muted-foreground">
                      {who ? who.email : r.actor_id ? 'Deleted user' : 'System'}
                      {r.actor_role && <Badge variant="outline" className="ml-1.5">{r.actor_role}</Badge>}
                    </span>
                    <time dateTime={r.created_at} className="text-[13px] tabular text-muted-foreground">
                      {formatDateTime(r.created_at)}
                    </time>
                  </summary>
                  <div className="grid grid-cols-1 gap-2 px-4 pb-4 pl-11">
                    <p className="text-[12px] text-muted-foreground">
                      Entity: <span className="font-mono">{r.entity_type}</span>
                      {r.entity_id && (
                        <>
                          {' '}
                          · id <span className="font-mono">{r.entity_id}</span>
                        </>
                      )}
                      {r.ip_address && <> · IP {r.ip_address}</>}
                    </p>
                    <AuditDiffView before={r.before_data} after={r.after_data} />
                  </div>
                </details>
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-3 text-[13px] text-muted-foreground">
        {formatNumber(total)} entr{total === 1 ? 'y' : 'ies'}
      </p>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefForPage={(p) => buildHref('/admin/audit-logs', { action, entity, actor, from, to, page: p })} />
    </>
  )
}
