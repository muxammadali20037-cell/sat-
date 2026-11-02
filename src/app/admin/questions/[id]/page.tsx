import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { CONTENT_ROLES, STAFF_ROLES, hasRole } from '@/config/roles'
import { PageHeader } from '@/components/layout/page-header'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { QuestionEditor } from '@/components/admin/question-editor'
import { editorTaxonomy } from '@/features/admin/editor-taxonomy'
import { loadQuestionForEditor } from '@/features/content/questions-server'
import { isUuid } from '@/features/admin/params'
import { excerpt } from '@/features/admin/format'

export const metadata: Metadata = { title: 'Edit question' }

export default async function EditQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole(STAFF_ROLES, { next: '/admin/questions' })
  const { id } = await params
  if (!isUuid(id)) notFound()
  const db = await createServerSupabase()
  const [question, taxonomy] = await Promise.all([loadQuestionForEditor(db, id), editorTaxonomy(db)])
  if (!question) notFound()
  const canEdit = hasRole(profile.role, CONTENT_ROLES)
  const { input, ...meta } = question
  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Question bank', href: '/admin/questions' }, { label: excerpt(input.stem, 48) || 'Question' }]} />}
        title={canEdit ? 'Edit question' : 'Review question'}
        description={canEdit ? undefined : 'Teachers can review questions and mark them reviewed. Editing and publishing are for content editors.'}
      />
      <QuestionEditor key={`${meta.updatedAt}-${meta.status}`} taxonomy={taxonomy} initial={input} meta={meta} canEdit={canEdit} canPublish={canEdit} />
    </>
  )
}
