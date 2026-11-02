import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { requireStudentReady } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getExamOverview } from '@/features/exams/queries'
import { ExamRunner } from '@/components/exams/exam-runner'

export const metadata: Metadata = { title: 'Mock exam' }

/** Exam room (/dashboard/mock-exams/<mockExamId>): instructions, timed modules, break, completion. */
export default async function MockExamRunnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await requireStudentReady({ next: `/dashboard/mock-exams/${id}` })
  if (!z.guid().safeParse(id).success) notFound()
  // Authorized above; the service-role read is scoped to this student's attempts.
  const overview = await getExamOverview(createAdminSupabase(), id, profile.id)
  if (!overview) notFound()
  return <ExamRunner overview={overview} />
}
