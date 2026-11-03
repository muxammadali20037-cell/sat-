import type { Metadata } from 'next'
import Link from 'next/link'
import QRCode from 'qrcode'
import { UsersRound } from 'lucide-react'
import { requireUser } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getDict, getLocale } from '@/lib/i18n/server'
import { format, plural } from '@/lib/i18n/dict'
import { classroomDict } from '@/lib/i18n/dictionaries/classroom'
import { siteUrl } from '@/lib/env'
import { PageHeader, Section } from '@/components/layout/page-header'
import { Badge, Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { ArchiveGroupButton, CreateAssignmentForm, CreateInvitationForm, InvitationList, RemoveStudentButton, type InvitationView } from '@/components/classroom/forms'
import { loadGroup, requireStaffMembership } from '@/features/classroom/server'
import { can } from '@/features/classroom/permissions'
import { getTaxonomy } from '@/features/taxonomy/server'
import { formatDate } from '@/features/dashboard/format'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDict(classroomDict)).teach.metaTitle }
}

export default async function GroupPage({ params }: { params: Promise<{ ws: string; groupId: string }> }) {
  const { ws, groupId } = await params
  const profile = await requireUser({ next: `/teach/${ws}/groups/${groupId}` })
  const admin = createAdminSupabase()
  const m = await requireStaffMembership(admin, profile.id, ws)
  const [c, locale] = await Promise.all([getDict(classroomDict), getLocale()])
  const t = c.teach
  const data = await loadGroup(admin, m, profile.id, groupId)
  const tz = profile.timezone || m.workspace.timezone
  const date = (iso: string) => formatDate(iso, locale, tz, { dateStyle: 'medium' })

  const [taxonomy, mocks] = await Promise.all([getTaxonomy(admin), admin.from('mock_exams').select('id, title').eq('status', 'published').order('created_at')])
  const invitations: InvitationView[] = await Promise.all(
    data.invitations.map(async (i) => {
      const link = siteUrl(`/join/${i.code}`)
      return { ...i, link, qr: await QRCode.toDataURL(link, { margin: 1, width: 224 }), expires: date(i.expiresAt) }
    }),
  )
  const teaches = true // loadGroup already enforced that this member teaches the group
  const kindLabel = (k: 'practice' | 'mock_exam' | 'text') => c.kinds[k]

  return (
    <>
      <PageHeader
        title={data.group.name}
        description={[data.group.subject, plural(data.students.length, c.students)].filter(Boolean).join(' · ')}
        actions={can(m.role, 'group.archive', { teachesGroup: teaches }) ? <ArchiveGroupButton workspaceId={ws} groupId={groupId} /> : undefined}
      />
      <div className="space-y-10">
        <Section title={t.group.studentsTitle}>
          {data.students.length === 0 ? (
            <EmptyState icon={<UsersRound />} title={t.group.noStudentsTitle} description={t.group.noStudentsBody} />
          ) : (
            <Card className="p-0">
              <ul className="divide-y divide-border">
                {data.students.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <Link href={`/teach/${ws}/students/${s.id}`} className="min-w-0 flex-1 group">
                      <p className="truncate text-sm font-medium text-foreground group-hover:text-primary group-hover:underline">{s.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[s.email, format(t.group.joined, { date: date(s.joinedAt) }), format(t.group.submittedCount, { n: s.done })].filter(Boolean).join(' · ')}
                      </p>
                    </Link>
                    <Badge variant={s.sharing ? 'success' : 'neutral'}>{s.sharing ? t.group.sharing : t.group.notSharing}</Badge>
                    <RemoveStudentButton workspaceId={ws} groupId={groupId} studentId={s.id} name={s.name} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </Section>

        <Section title={t.invite.title} description={t.invite.description}>
          <div className="space-y-4">
            <Card className="p-5">
              <CreateInvitationForm workspaceId={ws} groupId={groupId} roles={['student']} />
            </Card>
            <InvitationList workspaceId={ws} items={invitations} />
          </div>
        </Section>

        <Section title={t.assignment.title}>
          <div className="space-y-4">
            {data.assignments.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">{t.assignment.empty}</p>
            ) : (
              <Card className="p-0">
                <ul className="divide-y divide-border">
                  {data.assignments.map((a) => (
                    <li key={a.id}>
                      <Link href={`/teach/${ws}/assignments/${a.id}`} className="group flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-muted/40">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">{a.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {kindLabel(a.kind)} · {a.dueAt ? format(c.due, { date: date(a.dueAt) }) : c.noDue}
                          </p>
                        </div>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground tabular">
                          {a.submitted}/{data.students.length}
                          <Badge variant={a.status === 'closed' ? 'neutral' : 'primary'}>{c.statuses[a.status]}</Badge>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            <Card className="p-5">
              <h3 className="mb-4 text-[15px] font-semibold">{t.assignment.newTitle}</h3>
              <CreateAssignmentForm
                workspaceId={ws}
                groupId={groupId}
                options={{
                  domains: taxonomy.domains.map((d) => ({ id: d.id, name: d.name, subjectCode: (taxonomy.subjectById.get(d.subjectId)?.code ?? 'math') as 'math' | 'reading_writing' })),
                  mockExams: mocks.data ?? [],
                }}
              />
            </Card>
          </div>
        </Section>

        {data.staff.length > 0 && (
          <Section title={t.group.staffTitle}>
            <p className="text-sm text-muted-foreground">{data.staff.map((s) => `${s.name} (${c.roles[s.role as keyof typeof c.roles] ?? s.role})`).join(', ')}</p>
          </Section>
        )}
      </div>
    </>
  )
}
