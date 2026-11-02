import type { Metadata } from 'next'
import { requireRole } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { CONTENT_ROLES, STAFF_ROLES, hasRole } from '@/config/roles'
import { PageHeader } from '@/components/layout/page-header'
import { DataTable } from '@/components/ui/data-table'
import { SubjectEditButton } from '@/components/admin/taxonomy-editors'
import { curriculumUsage } from '@/features/admin/curriculum'
import { DbActionError } from '@/features/admin/server-utils'
import { formatNumber } from '@/lib/utils'

export const metadata: Metadata = { title: 'Subjects' }

export default async function SubjectsPage() {
  const profile = await requireRole(STAFF_ROLES, { next: '/admin/subjects' })
  const canEdit = hasRole(profile.role, CONTENT_ROLES)
  const db = await createServerSupabase()
  const [subjects, domains, usage] = await Promise.all([
    db.from('subjects').select('id, code, name, description, position').order('position'),
    db.from('domains').select('id, subject_id'),
    curriculumUsage(db),
  ])
  if (subjects.error) throw new DbActionError(subjects.error)
  if (domains.error) throw new DbActionError(domains.error)
  const rows = subjects.data ?? []

  return (
    <>
      <PageHeader title="Subjects" description="The two Digital SAT sections. Codes are fixed; names and descriptions are editable." />
      <DataTable
        caption="Subjects"
        rows={rows}
        rowKey={(r) => r.id}
        empty={{ title: 'No subjects', description: 'Run the reference-data migration to create Math and Reading and Writing.' }}
        columns={[
          {
            key: 'name',
            header: 'Subject',
            cell: (r) => (
              <div>
                <p className="font-medium">{r.name}</p>
                <p className="max-w-xl text-[13px] text-muted-foreground">{r.description || 'No description'}</p>
              </div>
            ),
          },
          { key: 'code', header: 'Code', cell: (r) => <code className="text-[13px]">{r.code}</code>, hideBelow: 'sm' },
          { key: 'domains', header: 'Domains', align: 'right', cell: (r) => formatNumber((domains.data ?? []).filter((d) => d.subject_id === r.id).length) },
          {
            key: 'questions',
            header: 'Questions',
            align: 'right',
            cell: (r) => (
              <span>
                {formatNumber(usage.subject(r.id).questions)} <span className="text-muted-foreground">({formatNumber(usage.subject(r.id).published)} published)</span>
              </span>
            ),
          },
          { key: 'courses', header: 'Courses', align: 'right', hideBelow: 'md', cell: (r) => formatNumber(usage.subject(r.id).courses) },
          { key: 'lessons', header: 'Lessons', align: 'right', hideBelow: 'md', cell: (r) => formatNumber(usage.subject(r.id).lessons) },
          { key: 'position', header: 'Position', align: 'right', hideBelow: 'lg', cell: (r) => r.position },
          ...(canEdit ? [{ key: 'actions', header: <span className="sr-only">Actions</span>, align: 'right' as const, cell: (r: (typeof rows)[number]) => <SubjectEditButton subject={r} /> }] : []),
        ]}
      />
    </>
  )
}
