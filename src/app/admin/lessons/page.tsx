import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireRole } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { CONTENT_ROLES, STAFF_ROLES, hasRole } from '@/config/roles'
import { PageHeader } from '@/components/layout/page-header'
import { DataTable, Pagination } from '@/components/ui/data-table'
import { Badge } from '@/components/ui/card'
import { FilterBar, FilterSearch, FilterSelect } from '@/components/admin/filter-bar'
import { ContentStatusBadge } from '@/components/admin/status-badge'
import { CONTENT_STATUSES, CONTENT_STATUS_LABELS, VIDEO_PROVIDER_LABELS, type VideoProvider } from '@/features/content/constants'
import { lessonEditorOptions } from '@/features/admin/lesson-options'
import { DbActionError } from '@/features/admin/server-utils'
import { buildHref, oneOf, pageFromParam, param, sanitizeSearch, uuidParam } from '@/features/admin/params'
import { formatDate } from '@/features/admin/format'
import { formatDuration, formatNumber } from '@/lib/utils'

export const metadata: Metadata = { title: 'Lessons' }
const PAGE_SIZE = 30

export default async function LessonsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireRole(STAFF_ROLES, { next: '/admin/lessons' })
  const canEdit = hasRole(profile.role, CONTENT_ROLES)
  const sp = await searchParams
  const course = uuidParam(sp.course)
  const status = oneOf(sp.status, CONTENT_STATUSES)
  const q = sanitizeSearch(param(sp.q))
  const page = pageFromParam(sp.page)
  const db = await createServerSupabase()

  let query = db
    .from('lessons')
    .select('id, course_id, skill_id, slug, title, status, position, duration_seconds, video_provider, is_free_preview, updated_at', { count: 'exact' })
  if (course) query = query.eq('course_id', course)
  if (status) query = query.eq('status', status)
  if (q) query = query.ilike('title', `%${q}%`)
  const from = (page - 1) * PAGE_SIZE
  const [options, lessons] = await Promise.all([
    lessonEditorOptions(db),
    query.order('course_id').order('position').order('title').range(from, from + PAGE_SIZE - 1),
  ])
  if (lessons.error) throw new DbActionError(lessons.error)
  const courseMap = new Map(options.courses.map((c) => [c.id, c]))
  const skillMap = new Map(options.skills.map((s) => [s.id, s.name]))
  const rows = lessons.data ?? []
  const total = lessons.count ?? 0
  const filtered = Boolean(course || status || q)

  return (
    <>
      <PageHeader
        title="Lessons"
        description="Video and text lessons. A lesson can be published once it has a video or at least 50 characters of notes."
        actions={
          canEdit && options.courses.length > 0 ? (
            <Link href={course ? `/admin/lessons/new?course=${course}` : '/admin/lessons/new'} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
              <Plus className="size-4" aria-hidden /> New lesson
            </Link>
          ) : undefined
        }
      />
      <FilterBar action="/admin/lessons" resetHref="/admin/lessons">
        <FilterSearch defaultValue={q} placeholder="Lesson title" />
        <FilterSelect name="course" label="Course" defaultValue={course} options={[{ value: '', label: 'All courses' }, ...options.courses.map((c) => ({ value: c.id, label: `${c.subjectName} · ${c.title}` }))]} />
        <FilterSelect name="status" label="Status" defaultValue={status} options={[{ value: '', label: 'Any status' }, ...CONTENT_STATUSES.map((s) => ({ value: s, label: CONTENT_STATUS_LABELS[s] }))]} />
      </FilterBar>
      <DataTable
        caption="Lessons"
        rows={rows}
        rowKey={(r) => r.id}
        empty={{
          title: filtered ? 'No lessons match these filters' : 'No lessons yet',
          description: options.courses.length === 0 ? 'Create a course first, then add lessons to it.' : filtered ? 'Reset the filters to see every lesson.' : 'Create the first lesson.',
          action:
            options.courses.length === 0 && canEdit ? (
              <Link href="/admin/courses" className="text-sm font-medium text-primary hover:underline">
                Go to courses
              </Link>
            ) : undefined,
        }}
        columns={[
          {
            key: 'title',
            header: 'Lesson',
            cell: (r) => (
              <div className="max-w-md">
                <Link href={`/admin/lessons/${r.id}`} className="font-medium hover:underline">
                  {r.title}
                </Link>
                <p className="text-[13px] text-muted-foreground">
                  {courseMap.get(r.course_id)?.title ?? 'Unknown course'}
                  {r.skill_id ? ` · ${skillMap.get(r.skill_id) ?? ''}` : ''}
                </p>
              </div>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            cell: (r) => (
              <div className="flex flex-wrap gap-1">
                <ContentStatusBadge status={r.status} />
                {r.is_free_preview && <Badge variant="primary">Free preview</Badge>}
              </div>
            ),
          },
          { key: 'media', header: 'Media', hideBelow: 'md', cell: (r) => <span className="text-[13px] text-muted-foreground">{VIDEO_PROVIDER_LABELS[r.video_provider as VideoProvider] ?? r.video_provider}</span> },
          { key: 'duration', header: 'Duration', align: 'right', hideBelow: 'sm', cell: (r) => (r.duration_seconds > 0 ? formatDuration(r.duration_seconds) : '—') },
          { key: 'position', header: 'Position', align: 'right', hideBelow: 'lg', cell: (r) => r.position },
          { key: 'updated', header: 'Updated', hideBelow: 'lg', cell: (r) => formatDate(r.updated_at) },
        ]}
      />
      <p className="mt-3 text-[13px] text-muted-foreground">{formatNumber(total)} lesson{total === 1 ? '' : 's'}</p>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefForPage={(p) => buildHref('/admin/lessons', { course, status, q, page: p })} />
    </>
  )
}
