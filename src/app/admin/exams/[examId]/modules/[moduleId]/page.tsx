import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { requireRole } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { CONTENT_ROLES, STAFF_ROLES, hasRole } from '@/config/roles'
import { PageHeader } from '@/components/layout/page-header'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { ModuleEditor } from '@/components/admin/exams/module-editor'
import { getModuleEditor } from '@/features/exams/admin'
import { moduleLabel } from '@/features/exams/builder'

export const metadata: Metadata = { title: 'Exam module' }

export default async function AdminExamModulePage({ params }: { params: Promise<{ examId: string; moduleId: string }> }) {
  const { examId, moduleId } = await params
  const profile = await requireRole(STAFF_ROLES)
  if (!z.guid().safeParse(examId).success || !z.guid().safeParse(moduleId).success) notFound()
  const data = await getModuleEditor(await createServerSupabase(), examId, moduleId)
  if (!data) notFound()
  const isContent = hasRole(profile.role, CONTENT_ROLES)
  const isDraft = data.exam.status === 'draft'
  const label = moduleLabel(data.module)

  return (
    <>
      <PageHeader
        breadcrumb={
          <Breadcrumb
            items={[
              { label: 'Mock exams', href: '/admin/exams' },
              { label: data.exam.title, href: `/admin/exams/${data.exam.id}` },
              { label },
            ]}
          />
        }
        title={label}
        description={`${Math.round(data.module.durationSeconds / 60)} minutes · ${data.exam.isFullLength ? 'full-length exam' : 'shortened exam'}`}
      />
      <ModuleEditor
        data={data}
        canEdit={isContent && isDraft}
        lockedReason={
          !isContent ? 'View only: content editors change exam questions.' : !isDraft ? 'This exam is not a draft. Move it to draft to change its questions.' : undefined
        }
      />
    </>
  )
}
