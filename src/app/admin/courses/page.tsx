import type { Metadata } from 'next'
import Link from 'next/link'
import { requireRole } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { CONTENT_ROLES, STAFF_ROLES, hasRole } from '@/config/roles'
import { PageHeader } from '@/components/layout/page-header'
import { DataTable } from '@/components/ui/data-table'
import { FilterBar, FilterSelect } from '@/components/admin/filter-bar'
import { ContentStatusBadge } from '@/components/admin/status-badge'
import { CourseDialogButton, DeleteCourseButton } from '@/components/admin/course-editor'
import { CONTENT_STATUSES, CONTENT_STATUS_LABELS, COURSE_LEVEL_LABELS, type CourseLevel } from '@/features/content/constants'
import { DbActionError, fetchAll } from '@/features/admin/server-utils'
import { oneOf, uuidParam } from '@/features/admin/params'
import { formatDate } from '@/features/admin/format'
import { formatNumber } from '@/lib/utils'

export const metadata: Metadata = { title: 'Courses' }

export default async function CoursesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireRole(STAFF_ROLES, { next: '/admin/courses' })
  const canEdit = hasRole(profile.role, CONTENT_ROLES)
  const sp = await searchParams
  const subjectFilter = uuidParam(sp.subject)
  const statusFilter = oneOf(sp.status, CONTENT_STATUSES)
  const db = await createServerSupabase()

  let q = db.from('courses').select('id, subject_id, slug, title, description, level, status, position, updated_at').order('position').order('title')
  if (subjectFilter) q = q.eq('subject_id', subjectFilter)
  if (statusFilter) q = q.eq('status', statusFilter)
  const [subjects, courses, lessons] = await Promise.all([
    db.from('subjects').select('id, name, position').order('position'),
    q,
    fetchAll((from, to) => db.from('lessons').select('id, course_id, status').order('id').range(from, to)),
  ])
  if (subjects.error) throw new DbActionError(subjects.error)
  if (courses.error) throw new DbActionError(courses.error)
  const subjectList = subjects.data ?? []
  const subjectName = new Map(subjectList.map((s) => [s.id, s.name]))
  const lessonCount = (id: string, status?: string) => lessons.rows.filter((l) => l.course_id === id && (!status || l.status === status)).length
  const rows = courses.data ?? []
  const filtered = Boolean(subjectFilter || statusFilter)

  return (
    <>
      <PageHeader
        title="Courses"
        description="Courses group lessons by subject. Students only see published courses and published lessons."
        actions={canEdit ? <CourseDialogButton subjects={subjectList} /> : undefined}
      />
      <FilterBar action="/admin/courses" resetHref="/admin/courses">
        <FilterSelect name="subject" label="Subject" defaultValue={subjectFilter} options={[{ value: '', label: 'All subjects' }, ...subjectList.map((s) => ({ value: s.id, label: s.name }))]} />
        <FilterSelect name="status" label="Status" defaultValue={statusFilter} options={[{ value: '', label: 'Any status' }, ...CONTENT_STATUSES.map((s) => ({ value: s, label: CONTENT_STATUS_LABELS[s] }))]} />
      </FilterBar>
      <DataTable
        caption="Courses"
        rows={rows}
        rowKey={(r) => r.id}
        empty={{
          title: filtered ? 'No courses match these filters' : 'No courses yet',
          description: filtered ? 'Reset the filters to see every course.' : canEdit ? 'Create a course, then add lessons to it.' : 'Content editors create courses.',
        }}
        columns={[
          {
            key: 'title',
            header: 'Course',
            cell: (r) => (
              <div className="max-w-md">
                <Link href={`/admin/lessons?course=${r.id}`} className="font-medium hover:underline">
                  {r.title}
                </Link>
                <p className="text-[13px] text-muted-foreground">
                  {subjectName.get(r.subject_id)} · {COURSE_LEVEL_LABELS[r.level as CourseLevel] ?? r.level} · <code>{r.slug}</code>
                </p>
              </div>
            ),
          },
          { key: 'status', header: 'Status', cell: (r) => <ContentStatusBadge status={r.status} /> },
          {
            key: 'lessons',
            header: 'Lessons',
            align: 'right',
            cell: (r) => (
              <span>
                {formatNumber(lessonCount(r.id))} <span className="text-muted-foreground">({formatNumber(lessonCount(r.id, 'published'))} published)</span>
              </span>
            ),
          },
          { key: 'position', header: 'Position', align: 'right', hideBelow: 'md', cell: (r) => r.position },
          { key: 'updated', header: 'Updated', hideBelow: 'lg', cell: (r) => formatDate(r.updated_at) },
          ...(canEdit
            ? [
                {
                  key: 'actions',
                  header: <span className="sr-only">Actions</span>,
                  align: 'right' as const,
                  cell: (r: (typeof rows)[number]) => (
                    <div className="flex justify-end gap-1">
                      <CourseDialogButton subjects={subjectList} course={r} />
                      <DeleteCourseButton id={r.id} title={r.title} lessonCount={lessonCount(r.id)} />
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />
    </>
  )
}
