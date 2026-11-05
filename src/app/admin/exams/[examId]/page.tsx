import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { requireRole } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { CONTENT_ROLES, STAFF_ROLES, hasRole } from '@/config/roles'
import { PageHeader, Section } from '@/components/layout/page-header'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { Alert, Badge, Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ExamForm } from '@/components/admin/exams/exam-form'
import { AutoFillExamButton, ExamStatusActions, ModuleDurationForm } from '@/components/admin/exams/exam-controls'
import { activeAttemptCount, examValidationIssues, getExamAdmin } from '@/features/exams/admin'
import { moduleLabel } from '@/features/exams/builder'
import { FULL_LENGTH_COUNTS } from '@/features/exams/machine'

export const metadata: Metadata = { title: 'Mock exam' }

const STATUS_VARIANT = { draft: 'neutral', published: 'success', archived: 'outline' } as const

export default async function AdminExamPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params
  const profile = await requireRole(STAFF_ROLES)
  if (!z.guid().safeParse(examId).success) notFound()
  const db = await createServerSupabase()
  const exam = await getExamAdmin(db, examId)
  if (!exam) notFound()
  const canEdit = hasRole(profile.role, CONTENT_ROLES)
  const isDraft = exam.status === 'draft'
  const [issues, activeAttempts] = await Promise.all([examValidationIssues(db, exam), activeAttemptCount(exam.id)])

  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Mock exams', href: '/admin/exams' }, { label: exam.title }]} />}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {exam.title} <Badge variant={STATUS_VARIANT[exam.status]}>{exam.status}</Badge>
          </span>
        }
        description={`${exam.isFullLength ? 'Full-length' : 'Shortened'} · ${exam.isAdaptive ? `adaptive (harder module 2 at ≥ ${Math.round(exam.routingThreshold * 100)}% in module 1)` : 'fixed modules'} · ${exam.breakSeconds > 0 ? `${Math.round(exam.breakSeconds / 60)}-minute break` : 'no break'}`}
        actions={canEdit && <ExamStatusActions examId={exam.id} status={exam.status} canPublish={issues.length === 0} activeAttempts={activeAttempts} />}
      />

      <div className="space-y-8">
        {activeAttempts > 0 && (
          <Alert variant="warning" icon={<AlertTriangle />} title={`${activeAttempts} attempt${activeAttempts === 1 ? ' is' : 's are'} in progress`}>
            Students build each module&apos;s question list when they begin it, so editing questions in a draft affects modules they have not started yet.
          </Alert>
        )}

        <Section title="Publish checklist">
          {issues.length === 0 ? (
            <Alert variant="success" icon={<CheckCircle2 className="text-success" />} title="Ready to publish">
              Every module has questions{exam.isFullLength ? ' and the full-length counts' : ''}, all questions are published, and no question repeats.
            </Alert>
          ) : (
            <Alert variant="warning" icon={<AlertTriangle />} title={`${issues.length} problem${issues.length === 1 ? '' : 's'} to fix before publishing`}>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </Alert>
          )}
        </Section>

        <Section
          title="Modules"
          description={isDraft ? 'Open a module to choose its questions, or fill every module at once (fresh questions first, by domain weight and difficulty).' : 'Move the exam to draft to change modules.'}
          actions={canEdit && isDraft ? <AutoFillExamButton examId={exam.id} /> : undefined}
        >
          <div className="overflow-x-auto relative rounded-lg border border-border bg-card">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                  <th className="h-10 px-4 font-medium">Module</th>
                  <th className="h-10 px-4 font-medium">Questions</th>
                  <th className="h-10 px-4 font-medium">Duration</th>
                  <th className="h-10 px-4" />
                </tr>
              </thead>
              <tbody>
                {exam.modules.map((m) => {
                  const target = exam.isFullLength ? FULL_LENGTH_COUNTS[m.section] : null
                  return (
                    <tr key={m.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium">{moduleLabel(m)}</td>
                      <td className={`px-4 py-3 tabular ${target !== null && m.questionCount !== target ? 'text-warning-foreground' : ''}`}>
                        {m.questionCount}
                        {target !== null && ` / ${target}`}
                      </td>
                      <td className="px-4 py-3">
                        <ModuleDurationForm moduleId={m.id} minutes={Math.round(m.durationSeconds / 60)} editable={canEdit && isDraft} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button asChild size="sm" variant="secondary">
                          <Link href={`/admin/exams/${exam.id}/modules/${m.id}`}>{canEdit && isDraft ? 'Edit questions' : 'View questions'}</Link>
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Settings">
          <Card>
            <CardContent className="pt-5">
              <ExamForm
                mode="edit"
                examId={exam.id}
                canEdit={canEdit}
                structureLocked={!isDraft}
                initial={{
                  title: exam.title,
                  slug: exam.slug,
                  description: exam.description,
                  isAdaptive: exam.isAdaptive,
                  isFullLength: exam.isFullLength,
                  routingThresholdPercent: String(Math.round(exam.routingThreshold * 100)),
                  breakMinutes: String(Math.round(exam.breakSeconds / 60)),
                }}
              />
            </CardContent>
          </Card>
        </Section>
      </div>
    </>
  )
}
