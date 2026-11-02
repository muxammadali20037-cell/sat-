import type { Metadata } from 'next'
import Link from 'next/link'
import { requireRole } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { ROLES, ROLE_LABELS, STUDENT_VIEWER_ROLES } from '@/config/roles'
import { PageHeader } from '@/components/layout/page-header'
import { DataTable, Pagination } from '@/components/ui/data-table'
import { Badge } from '@/components/ui/card'
import { FilterBar, FilterSearch, FilterSelect } from '@/components/admin/filter-bar'
import { RoleBadge } from '@/components/admin/status-badge'
import { StudentListQuerySchema, listStudents, type StudentListRow } from '@/features/admin/students'
import { buildHref, param } from '@/features/admin/params'
import { formatDate, timeAgo } from '@/features/admin/format'
import { formatNumber } from '@/lib/utils'

export const metadata: Metadata = { title: 'Students' }

export default async function StudentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(STUDENT_VIEWER_ROLES, { next: '/admin/students' })
  const sp = await searchParams
  const parsed = StudentListQuerySchema.safeParse({
    q: param(sp.q),
    role: sp.role === undefined ? 'STUDENT' : param(sp.role),
    onboarding: param(sp.onboarding),
    suspended: param(sp.suspended),
    page: param(sp.page) || 1,
  })
  const query = parsed.success ? parsed.data : StudentListQuerySchema.parse({})
  const db = await createServerSupabase()
  const { rows, total } = await listStudents(db, query)
  const filters = { q: query.q, role: query.role === 'STUDENT' ? undefined : query.role || 'all', onboarding: query.onboarding, suspended: query.suspended }
  const filtered = Boolean(query.q || query.onboarding || query.suspended || query.role !== 'STUDENT')

  return (
    <>
      <PageHeader title="Students" description={`${formatNumber(total)} ${filtered ? 'matching ' : ''}account${total === 1 ? '' : 's'}`} />
      <FilterBar action="/admin/students" resetHref="/admin/students">
        <FilterSearch defaultValue={query.q} placeholder="Name or email" />
        <FilterSelect
          name="role"
          label="Role"
          defaultValue={query.role === '' ? 'all' : query.role}
          options={[{ value: 'all', label: 'All roles' }, ...ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))]}
        />
        <FilterSelect
          name="onboarding"
          label="Onboarding"
          defaultValue={query.onboarding}
          options={[
            { value: '', label: 'Any' },
            { value: 'complete', label: 'Complete' },
            { value: 'incomplete', label: 'Not complete' },
          ]}
        />
        <FilterSelect
          name="suspended"
          label="Access"
          defaultValue={query.suspended}
          options={[
            { value: '', label: 'Any' },
            { value: 'no', label: 'Active' },
            { value: 'yes', label: 'Suspended' },
          ]}
        />
      </FilterBar>

      <DataTable<StudentListRow>
        caption="Students"
        rows={rows}
        rowKey={(r) => r.id}
        empty={{
          title: filtered ? 'No accounts match these filters' : 'No students yet',
          description: filtered ? 'Try a different search or reset the filters.' : 'Students appear here after they register.',
          action: filtered ? (
            <Link href="/admin/students" className="text-sm font-medium text-primary hover:underline">
              Reset filters
            </Link>
          ) : undefined,
        }}
        columns={[
          {
            key: 'name',
            header: 'Name',
            cell: (r) => (
              <div className="min-w-0">
                <Link href={`/admin/students/${r.id}`} className="font-medium hover:underline">
                  {r.fullName || 'Unnamed'}
                </Link>
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {r.isSuspended && <Badge variant="destructive">Suspended</Badge>}
                  {!r.onboardingCompleted && r.role === 'STUDENT' && <Badge variant="warning">Onboarding</Badge>}
                </div>
              </div>
            ),
          },
          { key: 'email', header: 'Email', cell: (r) => <span className="text-muted-foreground">{r.email}</span>, hideBelow: 'md' },
          { key: 'role', header: 'Role', cell: (r) => <RoleBadge role={r.role} /> },
          {
            key: 'plan',
            header: 'Plan',
            cell: (r) =>
              r.plan ? (
                <span>
                  {r.plan.name}
                  {r.plan.status === 'grace' && <Badge variant="warning" className="ml-1.5">Grace</Badge>}
                </span>
              ) : (
                <span className="text-muted-foreground">Free</span>
              ),
          },
          { key: 'joined', header: 'Joined', cell: (r) => formatDate(r.createdAt), hideBelow: 'lg' },
          { key: 'active', header: 'Last active', cell: (r) => <span className="text-muted-foreground">{timeAgo(r.lastActiveAt)}</span>, hideBelow: 'sm' },
        ]}
      />
      <Pagination page={query.page} pageSize={query.pageSize} total={total} hrefForPage={(page) => buildHref('/admin/students', { ...filters, page })} />
    </>
  )
}
