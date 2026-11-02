import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireRole } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { CONTENT_ROLES, STAFF_ROLES, hasRole } from '@/config/roles'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import { listExamsAdmin, type AdminExam } from '@/features/exams/admin'
import { FULL_LENGTH_COUNTS } from '@/features/exams/machine'

export const metadata: Metadata = { title: 'Mock exams' }

const STATUS_VARIANT = { draft: 'neutral', published: 'success', archived: 'outline' } as const

function ModuleCounts({ exam }: { exam: AdminExam }) {
  return (
    <div className="flex flex-col gap-0.5 text-[13px] tabular">
      {(['reading_writing', 'math'] as const).map((section) => {
        const mods = exam.modules.filter((m) => m.section === section)
        const target = exam.isFullLength ? FULL_LENGTH_COUNTS[section] : null
        return (
          <span key={section}>
            <span className="text-muted-foreground">{section === 'math' ? 'Math' : 'RW'}:</span>{' '}
            {mods.map((m, i) => (
              <span key={m.id} className={target !== null && m.questionCount !== target ? 'text-warning-foreground' : undefined}>
                {i > 0 && ' · '}
                {m.moduleNumber === 1 ? 'M1' : m.variant === 'standard' ? 'M2' : `M2 ${m.variant}`} {m.questionCount}
              </span>
            ))}
          </span>
        )
      })}
    </div>
  )
}

export default async function AdminExamsPage() {
  const profile = await requireRole(STAFF_ROLES)
  const canEdit = hasRole(profile.role, CONTENT_ROLES)
  const exams = await listExamsAdmin(await createServerSupabase())

  return (
    <>
      <PageHeader
        title="Mock exams"
        description="Build full-length or shortened Digital SAT simulations: modules, adaptive routing and question sets."
        actions={
          canEdit && (
            <Button asChild>
              <Link href="/admin/exams/new">
                <Plus /> New exam
              </Link>
            </Button>
          )
        }
      />
      <DataTable
        caption="Mock exams"
        rows={exams}
        rowKey={(e) => e.id}
        empty={{
          title: 'No mock exams yet',
          description: canEdit ? 'Create an exam, fill its modules from the question bank, then publish it.' : 'Content editors create exams here.',
          action: canEdit ? (
            <Button asChild>
              <Link href="/admin/exams/new">New exam</Link>
            </Button>
          ) : undefined,
        }}
        columns={[
          {
            key: 'title',
            header: 'Exam',
            cell: (e) => (
              <div>
                <Link href={`/admin/exams/${e.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                  {e.title}
                </Link>
                <p className="text-[13px] text-muted-foreground">{e.slug}</p>
              </div>
            ),
          },
          { key: 'status', header: 'Status', cell: (e) => <Badge variant={STATUS_VARIANT[e.status]}>{e.status}</Badge> },
          {
            key: 'format',
            header: 'Format',
            hideBelow: 'md',
            cell: (e) => (
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline">{e.isFullLength ? 'Full-length' : 'Shortened'}</Badge>
                <Badge variant="outline">{e.isAdaptive ? `Adaptive · ${Math.round(e.routingThreshold * 100)}%` : 'Fixed'}</Badge>
              </div>
            ),
          },
          { key: 'questions', header: 'Questions per module', cell: (e) => <ModuleCounts exam={e} /> },
          {
            key: 'updated',
            header: 'Updated',
            hideBelow: 'lg',
            cell: (e) => <span className="text-[13px] text-muted-foreground tabular">{new Date(e.updatedAt).toISOString().slice(0, 10)}</span>,
          },
        ]}
      />
    </>
  )
}
