import type { Metadata } from 'next'
import { requireRole } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { CONTENT_ROLES, STAFF_ROLES, hasRole } from '@/config/roles'
import { PageHeader } from '@/components/layout/page-header'
import { DataTable } from '@/components/ui/data-table'
import { Alert } from '@/components/ui/card'
import { DeleteEntityButton, DomainDialogButton } from '@/components/admin/taxonomy-editors'
import { curriculumUsage } from '@/features/admin/curriculum'
import { DbActionError } from '@/features/admin/server-utils'
import { formatNumber } from '@/lib/utils'

export const metadata: Metadata = { title: 'Domains' }

export default async function DomainsPage() {
  const profile = await requireRole(STAFF_ROLES, { next: '/admin/domains' })
  const canEdit = hasRole(profile.role, CONTENT_ROLES)
  const db = await createServerSupabase()
  const [subjects, domains, skills, usage] = await Promise.all([
    db.from('subjects').select('id, name, position').order('position'),
    db.from('domains').select('id, subject_id, code, name, description, weight_percent, position').order('position'),
    db.from('skills').select('id, domain_id'),
    curriculumUsage(db),
  ])
  for (const r of [subjects, domains, skills]) if (r.error) throw new DbActionError(r.error)
  const subjectList = subjects.data ?? []
  const subjectName = new Map(subjectList.map((s) => [s.id, s.name]))
  const rows = [...(domains.data ?? [])].sort(
    (a, b) => subjectList.findIndex((s) => s.id === a.subject_id) - subjectList.findIndex((s) => s.id === b.subject_id) || a.position - b.position,
  )
  const weightBySubject = new Map<string, number>()
  for (const d of rows) weightBySubject.set(d.subject_id, (weightBySubject.get(d.subject_id) ?? 0) + Number(d.weight_percent))
  const offWeights = subjectList.filter((s) => Math.abs((weightBySubject.get(s.id) ?? 0) - 100) > 0.5)

  return (
    <>
      <PageHeader
        title="Domains"
        description="Content areas within each subject. Weights drive exam auto-fill and diagnostic balance."
        actions={canEdit ? <DomainDialogButton subjects={subjectList} /> : undefined}
      />
      {offWeights.length > 0 && (
        <Alert variant="warning" className="mb-4" title="Domain weights do not add up to 100%">
          {offWeights.map((s) => `${s.name}: ${formatNumber(Math.round((weightBySubject.get(s.id) ?? 0) * 100) / 100)}%`).join(' · ')}
        </Alert>
      )}
      <DataTable
        caption="Domains"
        rows={rows}
        rowKey={(r) => r.id}
        empty={{ title: 'No domains yet', description: canEdit ? 'Create the first domain for a subject.' : 'Content editors create domains.' }}
        columns={[
          {
            key: 'name',
            header: 'Domain',
            cell: (r) => (
              <div>
                <p className="font-medium">{r.name}</p>
                <p className="text-[13px] text-muted-foreground">{subjectName.get(r.subject_id)}</p>
              </div>
            ),
          },
          { key: 'code', header: 'Code', hideBelow: 'md', cell: (r) => <code className="text-[13px]">{r.code}</code> },
          { key: 'weight', header: 'Weight', align: 'right', cell: (r) => `${Number(r.weight_percent)}%` },
          { key: 'skills', header: 'Skills', align: 'right', cell: (r) => formatNumber((skills.data ?? []).filter((s) => s.domain_id === r.id).length) },
          {
            key: 'questions',
            header: 'Questions',
            align: 'right',
            cell: (r) => (
              <span>
                {formatNumber(usage.domain(r.id).questions)} <span className="text-muted-foreground">({formatNumber(usage.domain(r.id).published)} published)</span>
              </span>
            ),
          },
          { key: 'lessons', header: 'Lessons', align: 'right', hideBelow: 'lg', cell: (r) => formatNumber(usage.domain(r.id).lessons) },
          ...(canEdit
            ? [
                {
                  key: 'actions',
                  header: <span className="sr-only">Actions</span>,
                  align: 'right' as const,
                  cell: (r: (typeof rows)[number]) => {
                    const skillCount = (skills.data ?? []).filter((s) => s.domain_id === r.id).length
                    const inUse = skillCount > 0 || usage.domain(r.id).questions > 0
                    return (
                      <div className="flex justify-end gap-1">
                        <DomainDialogButton subjects={subjectList} domain={{ ...r, weight_percent: Number(r.weight_percent) }} />
                        <DeleteEntityButton kind="domain" id={r.id} name={r.name} disabledReason={inUse ? 'In use by skills or questions' : undefined} />
                      </div>
                    )
                  },
                },
              ]
            : []),
        ]}
      />
    </>
  )
}
