import type { Metadata } from 'next'
import Link from 'next/link'
import { requireRole } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { CONTENT_ROLES } from '@/config/roles'
import { PageHeader } from '@/components/layout/page-header'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { EmptyState } from '@/components/ui/states'
import { LessonEditor } from '@/components/admin/lesson-editor'
import { lessonEditorOptions } from '@/features/admin/lesson-options'
import { uuidParam } from '@/features/admin/params'

export const metadata: Metadata = { title: 'New lesson' }

export default async function NewLessonPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(CONTENT_ROLES, { next: '/admin/lessons/new' })
  const sp = await searchParams
  const db = await createServerSupabase()
  const options = await lessonEditorOptions(db)
  const course = uuidParam(sp.course)
  return (
    <>
      <PageHeader breadcrumb={<Breadcrumb items={[{ label: 'Lessons', href: '/admin/lessons' }, { label: 'New lesson' }]} />} title="New lesson" />
      {options.courses.length === 0 ? (
        <EmptyState
          title="Create a course first"
          description="Every lesson belongs to a course."
          action={
            <Link href="/admin/courses" className="text-sm font-medium text-primary hover:underline">
              Go to courses
            </Link>
          }
        />
      ) : (
        <LessonEditor lesson={null} defaults={course && options.courses.some((c) => c.id === course) ? { course_id: course } : undefined} courses={options.courses} skills={options.skills} canEdit />
      )}
    </>
  )
}
