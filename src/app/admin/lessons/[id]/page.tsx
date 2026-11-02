import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { CONTENT_ROLES, STAFF_ROLES, hasRole } from '@/config/roles'
import { PageHeader } from '@/components/layout/page-header'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { LessonEditor } from '@/components/admin/lesson-editor'
import { lessonEditorOptions } from '@/features/admin/lesson-options'
import { loadLessonForEditor } from '@/features/content/lessons-server'
import { isUuid } from '@/features/admin/params'
import { formatDateTime } from '@/features/admin/format'

export const metadata: Metadata = { title: 'Edit lesson' }

export default async function EditLessonPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole(STAFF_ROLES, { next: '/admin/lessons' })
  const { id } = await params
  if (!isUuid(id)) notFound()
  const db = await createServerSupabase()
  const [lesson, options] = await Promise.all([loadLessonForEditor(db, id), lessonEditorOptions(db)])
  if (!lesson) notFound()
  const canEdit = hasRole(profile.role, CONTENT_ROLES)
  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Lessons', href: '/admin/lessons' }, { label: lesson.input.title ?? 'Lesson' }]} />}
        title={lesson.input.title ?? 'Lesson'}
        description={`Last updated ${formatDateTime(lesson.updatedAt)}${lesson.publishedAt ? ` · last published ${formatDateTime(lesson.publishedAt)}` : ''}${canEdit ? '' : ' · read only'}`}
      />
      <LessonEditor key={lesson.updatedAt} lesson={lesson} courses={options.courses} skills={options.skills} canEdit={canEdit} />
    </>
  )
}
