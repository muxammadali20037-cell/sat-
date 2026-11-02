import type { Metadata } from 'next'
import { requireRole } from '@/lib/auth/session'
import { CONTENT_ROLES } from '@/config/roles'
import { PageHeader } from '@/components/layout/page-header'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { Card, CardContent } from '@/components/ui/card'
import { ExamForm } from '@/components/admin/exams/exam-form'

export const metadata: Metadata = { title: 'New mock exam' }

export default async function NewExamPage() {
  await requireRole(CONTENT_ROLES)
  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Mock exams', href: '/admin/exams' }, { label: 'New exam' }]} />}
        title="New mock exam"
        description="Modules are created automatically: Reading and Writing and Math, each with module 1 and an easier and a harder module 2 (or one standard module 2)."
      />
      <Card>
        <CardContent className="pt-5">
          <ExamForm mode="create" />
        </CardContent>
      </Card>
    </>
  )
}
