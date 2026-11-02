import type { Metadata } from 'next'
import Link from 'next/link'
import { ClipboardCheck, Plus, Upload } from 'lucide-react'
import { requireRole } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { CONTENT_ROLES, STAFF_ROLES, hasRole } from '@/config/roles'
import { getTaxonomy } from '@/features/taxonomy/server'
import { PageHeader } from '@/components/layout/page-header'
import { DataTable, Pagination } from '@/components/ui/data-table'
import { Badge } from '@/components/ui/card'
import { FilterBar, FilterSearch, FilterSelect } from '@/components/admin/filter-bar'
import { QuestionStatusBadge } from '@/components/admin/status-badge'
import { SegmentedLinks } from '@/components/admin/metric-card'
import {
  DIFFICULTIES,
  QUESTION_SOURCES,
  QUESTION_SOURCE_LABELS,
  QUESTION_STATUSES,
  QUESTION_STATUS_LABELS,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPE_SHORT,
  type QuestionTypeValue,
} from '@/features/content/constants'
import { QUESTIONS_PAGE_SIZE, listQuestions, parseQuestionFilters } from '@/features/admin/question-list'
import { buildHref } from '@/features/admin/params'
import { excerpt, formatDate, timeAgo } from '@/features/admin/format'
import { DIFFICULTY_LABELS, type Difficulty } from '@/types/questions'
import { formatNumber } from '@/lib/utils'

export const metadata: Metadata = { title: 'Question bank' }

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireRole(STAFF_ROLES, { next: '/admin/questions' })
  const canEdit = hasRole(profile.role, CONTENT_ROLES)
  const f = parseQuestionFilters(await searchParams)
  const db = await createServerSupabase()
  const [taxonomy, { rows, total }] = await Promise.all([getTaxonomy(db), listQuestions(db, f)])
  const review = f.view === 'review'
  const base = {
    view: review ? 'review' : '',
    q: f.q,
    subject: f.subject,
    domain: f.domain,
    skill: f.skill,
    difficulty: f.difficulty,
    type: f.type,
    status: review ? '' : f.status,
    source: f.source,
  }
  const filtered = Boolean(f.q || f.subject || f.domain || f.skill || f.difficulty || f.type || f.source || (!review && f.status))
  const domains = taxonomy.domains.filter((d) => !f.subject || d.subjectId === f.subject)
  const skills = taxonomy.skills.filter((s) => (f.domain ? s.domainId === f.domain : domains.some((d) => d.id === s.domainId)))

  return (
    <>
      <PageHeader
        title={review ? 'Review queue' : 'Question bank'}
        description={
          review
            ? 'Draft questions, oldest first. Check the content and the answer key, then mark each one reviewed.'
            : 'Students only see published questions. Drafts must be reviewed before publishing.'
        }
        actions={
          canEdit ? (
            <>
              <Link href="/admin/question-import" className="inline-flex h-10 items-center gap-2 rounded-md border border-border-strong bg-surface px-4 text-sm font-medium hover:bg-muted">
                <Upload className="size-4" aria-hidden /> Import
              </Link>
              <Link href="/admin/questions/new" className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
                <Plus className="size-4" aria-hidden /> New question
              </Link>
            </>
          ) : undefined
        }
      />
      <div className="mb-3">
        <SegmentedLinks
          label="Question views"
          value={f.view}
          options={[
            { value: 'all', label: 'All questions' },
            { value: 'review', label: 'Review queue' },
          ]}
          hrefFor={(v) => (v === 'review' ? '/admin/questions?view=review' : '/admin/questions')}
        />
      </div>
      <FilterBar action="/admin/questions" resetHref={review ? '/admin/questions?view=review' : '/admin/questions'}>
        {review && <input type="hidden" name="view" value="review" />}
        <FilterSearch defaultValue={f.q} placeholder="Search stem or passage" />
        <FilterSelect name="subject" label="Subject" defaultValue={f.subject} options={[{ value: '', label: 'All' }, ...taxonomy.subjects.map((s) => ({ value: s.id, label: s.name }))]} />
        <FilterSelect name="domain" label="Domain" defaultValue={f.domain} options={[{ value: '', label: 'All' }, ...domains.map((d) => ({ value: d.id, label: d.name }))]} />
        <FilterSelect name="skill" label="Skill" defaultValue={f.skill} className="max-w-[14rem]" options={[{ value: '', label: 'All' }, ...skills.map((s) => ({ value: s.id, label: s.name }))]} />
        <FilterSelect name="difficulty" label="Difficulty" defaultValue={f.difficulty} options={[{ value: '', label: 'All' }, ...DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABELS[d] }))]} />
        <FilterSelect name="type" label="Format" defaultValue={f.type} options={[{ value: '', label: 'All' }, ...QUESTION_TYPES.map((t) => ({ value: t, label: QUESTION_TYPE_LABELS[t] }))]} />
        {!review && (
          <FilterSelect name="status" label="Status" defaultValue={f.status} options={[{ value: '', label: 'All' }, ...QUESTION_STATUSES.map((s) => ({ value: s, label: QUESTION_STATUS_LABELS[s] }))]} />
        )}
        <FilterSelect name="source" label="Source" defaultValue={f.source} options={[{ value: '', label: 'All' }, ...QUESTION_SOURCES.map((s) => ({ value: s, label: QUESTION_SOURCE_LABELS[s] }))]} />
      </FilterBar>

      <DataTable
        caption={review ? 'Review queue' : 'Questions'}
        rows={rows}
        rowKey={(r) => r.id}
        empty={
          review && !filtered
            ? { title: 'The review queue is empty', description: 'New and imported questions arrive here as drafts.' }
            : filtered
              ? { title: 'No questions match these filters', description: 'Try a different search or reset the filters.' }
              : {
                  title: 'No questions yet',
                  description: canEdit ? 'Write a question or import a CSV to start the bank.' : 'Content editors add questions.',
                  action: canEdit ? (
                    <Link href="/admin/question-import" className="text-sm font-medium text-primary hover:underline">
                      Import questions
                    </Link>
                  ) : undefined,
                }
        }
        columns={[
          {
            key: 'stem',
            header: 'Question',
            cell: (r) => (
              <div className="max-w-xl">
                <Link href={`/admin/questions/${r.id}`} className="font-medium hover:underline">
                  {excerpt(r.stem, 110) || 'Untitled'}
                </Link>
                <p className="truncate text-[13px] text-muted-foreground">
                  {taxonomy.skillById.get(r.skill_id)?.name ?? 'Unknown skill'} · {taxonomy.domainById.get(r.domain_id)?.name ?? ''}
                </p>
              </div>
            ),
          },
          { key: 'status', header: 'Status', cell: (r) => <QuestionStatusBadge status={r.status} /> },
          {
            key: 'difficulty',
            header: 'Difficulty',
            hideBelow: 'sm',
            cell: (r) => (
              <Badge variant={r.difficulty === 'hard' ? 'warning' : r.difficulty === 'easy' ? 'success' : 'neutral'}>{DIFFICULTY_LABELS[r.difficulty as Difficulty] ?? r.difficulty}</Badge>
            ),
          },
          {
            key: 'type',
            header: 'Format',
            hideBelow: 'md',
            cell: (r) => (
              <span className="text-[13px]">
                {QUESTION_TYPE_SHORT[r.question_type as QuestionTypeValue] ?? r.question_type}
                {r.stimulus_type !== 'text' && <span className="text-muted-foreground"> · {r.stimulus_type}</span>}
              </span>
            ),
          },
          { key: 'source', header: 'Source', hideBelow: 'lg', cell: (r) => <span className="text-[13px] text-muted-foreground">{QUESTION_SOURCE_LABELS[r.source as keyof typeof QUESTION_SOURCE_LABELS] ?? r.source}</span> },
          {
            key: 'date',
            header: review ? 'Waiting since' : 'Updated',
            hideBelow: 'md',
            cell: (r) => <span className="text-[13px] text-muted-foreground">{review ? `${formatDate(r.created_at)} (${timeAgo(r.created_at)})` : timeAgo(r.updated_at)}</span>,
          },
        ]}
      />
      <div className="mt-3 flex items-center gap-2 text-[13px] text-muted-foreground">
        {review && <ClipboardCheck className="size-4" aria-hidden />}
        {formatNumber(total)} question{total === 1 ? '' : 's'}
        {filtered ? ' match' : ''}
      </div>
      <Pagination page={f.page} pageSize={QUESTIONS_PAGE_SIZE} total={total} hrefForPage={(page) => buildHref('/admin/questions', { ...base, page })} />
    </>
  )
}
