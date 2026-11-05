import type { Metadata } from 'next'
import { requireRole } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { CONTENT_ROLES } from '@/config/roles'
import { PageHeader } from '@/components/layout/page-header'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { QuestionImportClient } from '@/components/admin/question-import-client'
import { editorTaxonomy } from '@/features/admin/editor-taxonomy'
import { bundledPacksStatus } from '@/features/content/question-pack'
import { ImportQuestionPack } from '@/components/admin/import-question-pack'

export const metadata: Metadata = { title: 'Import questions' }

export default async function QuestionImportPage() {
  await requireRole(CONTENT_ROLES, { next: '/admin/question-import' })
  const db = await createServerSupabase()
  const [taxonomy, packs] = await Promise.all([editorTaxonomy(db), bundledPacksStatus(db)])
  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Question bank', href: '/admin/questions' }, { label: 'Import' }]} />}
        title="Import questions"
        description="Bulk-create questions from CSV or JSON. Every row is validated first; valid rows are saved as drafts for review."
      />
      {packs.map((p) => (
        <ImportQuestionPack key={p.id} {...p} />
      ))}
      <QuestionImportClient taxonomy={taxonomy} />
    </>
  )
}
