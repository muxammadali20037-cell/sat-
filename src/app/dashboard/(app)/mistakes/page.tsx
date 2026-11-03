import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, CircleAlert } from 'lucide-react'
import { requireStudentReady } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getDict, getLocale } from '@/lib/i18n/server'
import { format, plural } from '@/lib/i18n/dict'
import { mistakesDict } from '@/lib/i18n/dictionaries/mistakes'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { StartPracticeButton } from '@/components/practice/start-practice-button'
import { loadNotebook, type NotebookItem } from '@/features/mistakes/server'
import { getMaxQuestionsPerSession } from '@/features/practice/server'
import { formatDate } from '@/features/dashboard/format'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict(mistakesDict)
  return { title: t.metaTitle }
}

type SubjectFilter = 'math' | 'reading_writing' | null

export default async function MistakesPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const profile = await requireStudentReady({ next: '/dashboard/mistakes' })
  const [t, locale, sp] = await Promise.all([getDict(mistakesDict), getLocale(), searchParams])
  const admin = createAdminSupabase()
  const [notebook, perSession] = await Promise.all([loadNotebook(admin, profile.id), getMaxQuestionsPerSession(admin)])
  const subject: SubjectFilter = sp.subject === 'math' || sp.subject === 'reading_writing' ? sp.subject : null
  const tz = profile.timezone || 'Asia/Tashkent'

  const items = subject ? notebook.open.filter((m) => m.subjectCode === subject) : notebook.open
  const practisable = items.filter((m) => m.published).length

  // Group by skill, largest group first.
  const groups = new Map<string, { skillId: string | null; name: string; items: NotebookItem[] }>()
  for (const m of items) {
    const key = m.skillId ?? 'other'
    const g = groups.get(key) ?? { skillId: m.skillId, name: m.skillName ?? t.otherSkill, items: [] }
    g.items.push(m)
    groups.set(key, g)
  }
  const ordered = [...groups.values()].sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name))

  const filters: Array<{ key: SubjectFilter; label: string; count: number }> = [
    { key: null, label: t.all, count: notebook.open.length },
    { key: 'math', label: t.subjects.math, count: notebook.open.filter((m) => m.subjectCode === 'math').length },
    { key: 'reading_writing', label: t.subjects.reading_writing, count: notebook.open.filter((m) => m.subjectCode === 'reading_writing').length },
  ]

  return (
    <>
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          practisable > 0 ? (
            <StartPracticeButton request={{ mode: 'mistakes', ...(subject ? { subjectCode: subject } : {}) }}>{t.practiseAll}</StartPracticeButton>
          ) : undefined
        }
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={t.title} className="flex flex-wrap gap-2">
          {filters.map((f) => {
            const active = f.key === subject
            return (
              <Link
                key={f.key ?? 'all'}
                href={f.key ? `/dashboard/mistakes?subject=${f.key}` : '/dashboard/mistakes'}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors',
                  active ? 'border-primary bg-primary-soft font-medium text-primary' : 'border-border hover:bg-muted',
                )}
              >
                {f.label}
                <span className="tabular text-xs text-muted-foreground">{f.count}</span>
              </Link>
            )
          })}
        </nav>
        <p className="text-[13px] text-muted-foreground">
          {plural(notebook.open.length, t.open)} · {plural(notebook.fixedCount, t.fixed)}
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<CircleAlert />}
          title={t.emptyTitle}
          description={notebook.fixedCount > 0 && !subject ? t.emptyFixed : t.emptyBody}
          action={
            <Button asChild>
              <Link href="/dashboard/practice">{t.startPractice}</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {practisable > perSession && <p className="text-[13px] text-muted-foreground">{format(t.sessionNote, { n: perSession })}</p>}
          {ordered.map((g) => {
            const canPractise = g.skillId !== null && g.items.some((m) => m.published)
            return (
              <Card key={g.skillId ?? 'other'} className="p-0">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
                  <div className="min-w-0">
                    <h2 className="truncate text-[15px] font-semibold text-foreground">{g.name}</h2>
                    <p className="text-xs text-muted-foreground">{plural(g.items.length, t.perSkill)}</p>
                  </div>
                  {canPractise && (
                    <StartPracticeButton request={{ mode: 'mistakes', skillId: g.skillId! }} size="sm" variant="secondary">
                      {t.practiseSkill}
                    </StartPracticeButton>
                  )}
                </div>
                <ul className="divide-y divide-border">
                  {g.items.map((m) => (
                    <li key={m.questionId}>
                      <Link href={m.reviewHref} className="group flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm text-foreground group-hover:text-primary">{m.excerpt}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {plural(m.timesWrong, t.timesWrong)} · {format(t.lastWrong, { date: formatDate(m.lastWrongAt, locale, tz, { month: 'short', day: 'numeric' }) })}
                            {!m.published && <span className="text-warning-foreground"> · {t.unpublished}</span>}
                          </p>
                        </div>
                        <span className="flex shrink-0 items-center text-[13px] font-medium text-primary">
                          {t.review}
                          <ChevronRight className="size-4" aria-hidden />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
