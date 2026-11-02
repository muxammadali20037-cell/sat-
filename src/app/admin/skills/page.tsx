import type { Metadata } from 'next'
import { requireRole } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { CONTENT_ROLES, STAFF_ROLES, hasRole } from '@/config/roles'
import { PageHeader } from '@/components/layout/page-header'
import { DataTable } from '@/components/ui/data-table'
import { FilterBar, FilterSelect } from '@/components/admin/filter-bar'
import { DeleteEntityButton, SkillDialogButton } from '@/components/admin/taxonomy-editors'
import { curriculumUsage } from '@/features/admin/curriculum'
import { DbActionError } from '@/features/admin/server-utils'
import { uuidParam } from '@/features/admin/params'
import { formatNumber } from '@/lib/utils'

export const metadata: Metadata = { title: 'Skills' }

export default async function SkillsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireRole(STAFF_ROLES, { next: '/admin/skills' })
  const canEdit = hasRole(profile.role, CONTENT_ROLES)
  const sp = await searchParams
  const domainFilter = uuidParam(sp.domain)
  const db = await createServerSupabase()
  const [subjects, domains, skills, usage] = await Promise.all([
    db.from('subjects').select('id, name, position').order('position'),
    db.from('domains').select('id, subject_id, name, position').order('position'),
    db.from('skills').select('id, domain_id, code, name, description, learning_objectives, position').order('position'),
    curriculumUsage(db),
  ])
  for (const r of [subjects, domains, skills]) if (r.error) throw new DbActionError(r.error)
  const subjectName = new Map((subjects.data ?? []).map((s) => [s.id, s.name]))
  const subjectOrder = new Map((subjects.data ?? []).map((s, i) => [s.id, i]))
  const domainList = [...(domains.data ?? [])]
    .sort((a, b) => (subjectOrder.get(a.subject_id) ?? 0) - (subjectOrder.get(b.subject_id) ?? 0) || a.position - b.position)
    .map((d) => ({ id: d.id, name: d.name, subjectName: subjectName.get(d.subject_id) ?? '' }))
  const domainIndex = new Map(domainList.map((d, i) => [d.id, i]))
  const rows = (skills.data ?? [])
    .filter((s) => !domainFilter || s.domain_id === domainFilter)
    .sort((a, b) => (domainIndex.get(a.domain_id) ?? 0) - (domainIndex.get(b.domain_id) ?? 0) || a.position - b.position)

  return (
    <>
      <PageHeader
        title="Skills"
        description="The atomic unit for questions, lessons, analytics and study plans."
        actions={canEdit ? <SkillDialogButton domains={domainList} /> : undefined}
      />
      <FilterBar action="/admin/skills" resetHref="/admin/skills">
        <FilterSelect
          name="domain"
          label="Domain"
          defaultValue={domainFilter}
          options={[{ value: '', label: 'All domains' }, ...domainList.map((d) => ({ value: d.id, label: `${d.subjectName} · ${d.name}` }))]}
        />
      </FilterBar>
      <DataTable
        caption="Skills"
        rows={rows}
        rowKey={(r) => r.id}
        empty={{ title: 'No skills in this domain', description: canEdit ? 'Create a skill to start adding questions and lessons to it.' : undefined }}
        columns={[
          {
            key: 'name',
            header: 'Skill',
            cell: (r) => {
              const d = domainList[domainIndex.get(r.domain_id) ?? -1]
              return (
                <div className="max-w-md">
                  <p className="font-medium">{r.name}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {d ? `${d.subjectName} · ${d.name}` : ''}
                    {r.learning_objectives.length > 0 && ` · ${r.learning_objectives.length} objective${r.learning_objectives.length === 1 ? '' : 's'}`}
                  </p>
                </div>
              )
            },
          },
          { key: 'code', header: 'Code', hideBelow: 'md', cell: (r) => <code className="text-[13px]">{r.code}</code> },
          {
            key: 'questions',
            header: 'Questions',
            align: 'right',
            cell: (r) => (
              <span>
                {formatNumber(usage.skill(r.id).questions)} <span className="text-muted-foreground">({formatNumber(usage.skill(r.id).published)} published)</span>
              </span>
            ),
          },
          { key: 'lessons', header: 'Lessons', align: 'right', hideBelow: 'sm', cell: (r) => formatNumber(usage.skill(r.id).lessons) },
          ...(canEdit
            ? [
                {
                  key: 'actions',
                  header: <span className="sr-only">Actions</span>,
                  align: 'right' as const,
                  cell: (r: (typeof rows)[number]) => (
                    <div className="flex justify-end gap-1">
                      <SkillDialogButton domains={domainList} skill={r} />
                      <DeleteEntityButton
                        kind="skill"
                        id={r.id}
                        name={r.name}
                        disabledReason={usage.skill(r.id).questions > 0 ? 'Used by questions' : undefined}
                      />
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />
    </>
  )
}
