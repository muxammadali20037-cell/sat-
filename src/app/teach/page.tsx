import type { Metadata } from 'next'
import Link from 'next/link'
import { Presentation } from 'lucide-react'
import { requireUser } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getDict } from '@/lib/i18n/server'
import { format } from '@/lib/i18n/dict'
import { classroomDict } from '@/lib/i18n/dictionaries/classroom'
import { PageHeader, Section } from '@/components/layout/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/states'
import { TeachShell } from '@/components/classroom/teach-shell'
import { CreateWorkspaceForm } from '@/components/classroom/forms'
import { listMemberships } from '@/features/classroom/server'
import { isStaffRole } from '@/features/classroom/permissions'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDict(classroomDict)).teach.metaTitle }
}

export default async function TeachHomePage() {
  const profile = await requireUser({ next: '/teach' })
  const c = await getDict(classroomDict)
  const t = c.teach.home
  const memberships = (await listMemberships(createAdminSupabase(), profile.id)).filter((m) => isStaffRole(m.role))

  return (
    <TeachShell profile={profile}>
      <PageHeader title={t.title} description={t.description} />
      <div className="space-y-10">
        <Section title={t.yours}>
          {memberships.length === 0 ? (
            <EmptyState icon={<Presentation />} title={t.emptyTitle} description={t.emptyBody} />
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {memberships.map((m) => (
                <li key={m.workspace.id}>
                  <Card className="flex items-center justify-between gap-3 p-5">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-foreground">{m.workspace.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.kinds[m.workspace.kind]} · {format(t.yourRole, { role: c.roles[m.role] })}
                      </p>
                    </div>
                    <Button asChild size="sm">
                      <Link href={`/teach/${m.workspace.id}`}>{t.open}</Link>
                    </Button>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title={t.createTitle}>
          <Card className="p-5">
            <CreateWorkspaceForm />
          </Card>
        </Section>
      </div>
    </TeachShell>
  )
}
