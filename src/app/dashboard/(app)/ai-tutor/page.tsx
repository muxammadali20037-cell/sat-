import type { Metadata } from 'next'
import { requireStudentReady } from '@/lib/auth/session'
import { getDict } from '@/lib/i18n/server'
import { tutorDict } from '@/lib/i18n/dictionaries/tutor'
import { PageHeader } from '@/components/layout/page-header'
import { loadTutorPage } from '@/features/ai-tutor/page-data'
import { TutorWorkspace } from '@/components/ai/tutor-workspace'

export const metadata: Metadata = { title: 'AI tutor' }

/** /dashboard/ai-tutor — supports ?session=<id> and the ?questionId=<uuid> URL contract. */
export default async function AiTutorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireStudentReady({ next: '/dashboard/ai-tutor' })
  const sp = await searchParams
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const sessionId = first(sp.session)
  const questionId = first(sp.questionId)
  const [t, data] = await Promise.all([getDict(tutorDict), loadTutorPage(profile, { sessionId, questionId })])

  return (
    <>
      <PageHeader title={t.title} description={t.description} className="mb-4 lg:mb-6" />
      <TutorWorkspace key={`${data.session?.id ?? 'new'}:${data.context?.questionId ?? ''}`} data={data} />
    </>
  )
}
