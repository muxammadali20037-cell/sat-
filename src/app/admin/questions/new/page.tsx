import type { Metadata } from 'next'
import { requireRole } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { CONTENT_ROLES } from '@/config/roles'
import { PageHeader } from '@/components/layout/page-header'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { QuestionEditor } from '@/components/admin/question-editor'
import { editorTaxonomy } from '@/features/admin/editor-taxonomy'
import { emptyQuestionInput } from '@/features/content/question-schema'
import { uuidParam } from '@/features/admin/params'

export const metadata: Metadata = { title: 'New question' }

export default async function NewQuestionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(CONTENT_ROLES, { next: '/admin/questions/new' })
  const sp = await searchParams
  const db = await createServerSupabase()
  const taxonomy = await editorTaxonomy(db)
  // Optional preselection from ?skill=<uuid>
  const skillId = uuidParam(sp.skill)
  const skill = taxonomy.skills.find((s) => s.id === skillId)
  const domain = skill ? taxonomy.domains.find((d) => d.id === skill.domainId) : undefined
  const initial = emptyQuestionInput(skill && domain ? { skill_id: skill.id, domain_id: domain.id, subject_id: domain.subjectId } : {})
  return (
    <>
      <PageHeader breadcrumb={<Breadcrumb items={[{ label: 'Question bank', href: '/admin/questions' }, { label: 'New question' }]} />} title="New question" />
      <QuestionEditor taxonomy={taxonomy} initial={initial} meta={null} canEdit canPublish />
    </>
  )
}
