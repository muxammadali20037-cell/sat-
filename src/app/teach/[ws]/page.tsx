import type { Metadata } from 'next'
import Link from 'next/link'
import { LayoutGrid } from 'lucide-react'
import { requireUser } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getDict } from '@/lib/i18n/server'
import { plural } from '@/lib/i18n/dict'
import { classroomDict } from '@/lib/i18n/dictionaries/classroom'
import { PageHeader, Section } from '@/components/layout/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { CreateGroupForm } from '@/components/classroom/forms'
import { loadOverview, requireStaffMembership } from '@/features/classroom/server'
import { can } from '@/features/classroom/permissions'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDict(classroomDict)).teach.metaTitle }
}

export default async function WorkspacePage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params
  const profile = await requireUser({ next: `/teach/${ws}` })
  const admin = createAdminSupabase()
  const m = await requireStaffMembership(admin, profile.id, ws)
  const c = await getDict(classroomDict)
  const t = c.teach.overview
  const { groups } = await loadOverview(admin, m, profile.id)
  const canCreate = can(m.role, 'group.create')

  return (
    <>
      <PageHeader title={m.workspace.name} description={c.teach.home.kinds[m.workspace.kind]} />
      <div className="space-y-10">
        <Section title={t.groupsTitle} description={t.groupsHint}>
          {groups.length === 0 ? (
            <EmptyState icon={<LayoutGrid />} title={t.noGroupsTitle} description={canCreate ? t.noGroupsBody : t.noGroupsAssistant} />
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {groups.map((g) => (
                <li key={g.id}>
                  <Link href={`/teach/${ws}/groups/${g.id}`} className="block h-full">
                    <Card className="h-full p-5 transition-colors hover:border-primary">
                      <p className="truncate text-[15px] font-semibold text-foreground">{g.name}</p>
                      {g.subject && <p className="text-xs text-muted-foreground">{g.subject}</p>}
                      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                        <span>{plural(g.students, c.students)}</span>
                        <span>{plural(g.assignments, c.assignmentsCount)}</span>
                        {g.toGrade > 0 && <span className="font-medium text-warning-foreground">{plural(g.toGrade, c.toGrade)}</span>}
                      </p>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
        {canCreate && (
          <Section title={t.newGroup}>
            <Card className="p-5">
              <CreateGroupForm workspaceId={ws} />
            </Card>
          </Section>
        )}
      </div>
    </>
  )
}
