'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Plus, Search, Trash2, Wand2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, IconButton } from '@/components/ui/button'
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { FormField, Input, NativeSelect } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/states'
import { toast } from '@/components/ui/toast'
import { RichText } from '@/components/learning/rich-text'
import { apportion } from '@/features/exams/builder'
import { FULL_LENGTH_COUNTS } from '@/features/exams/machine'
import type { ModuleEditorData } from '@/features/exams/admin'
import {
  addQuestionAction,
  autoFillModuleAction,
  moveQuestionAction,
  removeQuestionAction,
  searchQuestionsAction,
  type QuestionSearchRow,
} from '@/features/exams/admin-actions'

const DIFFICULTY_VARIANT = { easy: 'success', medium: 'neutral', hard: 'warning' } as const

export function ModuleEditor({ data, canEdit, lockedReason }: { data: ModuleEditorData; canEdit: boolean; lockedReason?: string }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const { module, exam, entries } = data
  const fullLength = exam.isFullLength
  const target = fullLength ? FULL_LENGTH_COUNTS[module.section] : null

  const act = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) toast.error(res.error ?? 'Something went wrong.')
      else if (res.message) toast.success(res.message)
      router.refresh()
    })

  const coverageTotal = target ?? entries.length
  const domainTargets = apportion(
    coverageTotal,
    data.domains.map((d) => ({ key: d.id, weight: d.weightPercent })),
  )

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              Questions{' '}
              <span className={cn('tabular', target !== null && entries.length !== target ? 'text-warning-foreground' : 'text-muted-foreground')}>
                {entries.length}
                {target !== null && ` / ${target}`}
              </span>
            </CardTitle>
            <CardDescription>
              {lockedReason ?? 'Students see these in this order. Reorder with the arrows; removing a question never deletes it from the bank.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {entries.length === 0 ? (
              <EmptyState title="No questions yet" description="Use auto-fill or search the bank to add questions to this module." />
            ) : (
              <ol className="divide-y divide-border rounded-lg border border-border">
                {entries.map((e, i) => (
                  <li key={e.entryId} className="flex items-start gap-3 px-3 py-3">
                    <span className="mt-0.5 flex h-6 min-w-6 items-center justify-center rounded bg-muted text-xs font-semibold tabular">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-sm">
                        <RichText source={e.stem} />
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Badge variant="outline">{e.skillName}</Badge>
                        <Badge variant={DIFFICULTY_VARIANT[e.difficulty]}>{e.difficulty}</Badge>
                        {e.questionType !== 'multiple_choice' && <Badge variant="neutral">Typed answer</Badge>}
                        {e.status !== 'published' && <Badge variant="destructive">{e.status}</Badge>}
                      </div>
                    </div>
                    {canEdit && (
                      <div className="flex shrink-0 items-center">
                        <IconButton
                          size="icon-sm"
                          aria-label="Move up"
                          icon={<ArrowUp />}
                          disabled={pending || i === 0}
                          onClick={() => act(() => moveQuestionAction({ moduleId: module.id, entryId: e.entryId, direction: 'up' }))}
                        />
                        <IconButton
                          size="icon-sm"
                          aria-label="Move down"
                          icon={<ArrowDown />}
                          disabled={pending || i === entries.length - 1}
                          onClick={() => act(() => moveQuestionAction({ moduleId: module.id, entryId: e.entryId, direction: 'down' }))}
                        />
                        <IconButton
                          size="icon-sm"
                          aria-label="Remove from module"
                          icon={<Trash2 />}
                          disabled={pending}
                          onClick={() => act(() => removeQuestionAction({ moduleId: module.id, entryId: e.entryId }))}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
        {canEdit && <QuestionSearch data={data} onAdded={() => router.refresh()} />}
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Domain coverage</CardTitle>
            <CardDescription>Targets follow the official domain weights{target === null ? ' for the current size' : ''}.</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                {data.domains.map((d) => {
                  const have = entries.filter((e) => e.domainId === d.id).length
                  const want = domainTargets.get(d.id) ?? 0
                  return (
                    <tr key={d.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-2">{d.name}</td>
                      <td className="py-2 text-right text-muted-foreground tabular">{d.weightPercent}%</td>
                      <td className={cn('py-2 pl-3 text-right tabular', have !== want && 'text-warning-foreground')}>
                        {have} / {want}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
        {canEdit && <AutoFill data={data} />}
      </div>
    </div>
  )
}

function AutoFill({ data }: { data: ModuleEditorData }) {
  const router = useRouter()
  const { module, exam, entries } = data
  const fixed = exam.isFullLength ? FULL_LENGTH_COUNTS[module.section] : null
  const [count, setCount] = React.useState(String(fixed ?? Math.max(entries.length, 10)))
  const [mode, setMode] = React.useState<'append' | 'replace'>(entries.length > 0 ? 'append' : 'replace')
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const difficultyText =
    module.moduleNumber === 1 || module.variant === 'standard'
      ? 'an even mix of easy, medium and hard'
      : module.variant === 'easier'
        ? 'easy and medium questions'
        : 'medium and hard questions'

  const run = () =>
    startTransition(async () => {
      const res = await autoFillModuleAction({ moduleId: module.id, count: fixed ?? count, mode })
      setConfirmOpen(false)
      if (!res.ok) toast.error(res.error)
      else if (res.data && res.data.shortfall > 0) toast.warning(res.message ?? 'Added')
      else toast.success(res.message ?? 'Added')
      router.refresh()
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Auto-fill</CardTitle>
        <CardDescription>
          Picks published questions by domain weight with {difficultyText}, spread across skills. Never reuses a question already in this exam.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4">
        <FormField id="autofill-count" label="Questions in module" description={fixed !== null ? 'Fixed for full-length exams.' : '1–60 for a shortened exam.'}>
          {(aria) => <Input {...aria} type="number" min={1} max={60} value={fixed ?? count} disabled={fixed !== null} onChange={(e) => setCount(e.target.value)} />}
        </FormField>
        <FormField id="autofill-mode" label="Mode">
          {(aria) => (
            <NativeSelect {...aria} value={mode} onChange={(e) => setMode(e.target.value as 'append' | 'replace')}>
              <option value="append">Fill the remaining slots</option>
              <option value="replace">Replace all questions</option>
            </NativeSelect>
          )}
        </FormField>
        <Button onClick={() => (mode === 'replace' && entries.length > 0 ? setConfirmOpen(true) : run())} loading={pending}>
          <Wand2 /> Auto-fill module
        </Button>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Replace all questions?"
          description={`The ${entries.length} questions in this module will be removed from it (not from the bank) and a new set will be chosen.`}
          confirmLabel="Replace questions"
          destructive
          loading={pending}
          onConfirm={run}
        />
      </CardContent>
    </Card>
  )
}

function QuestionSearch({ data, onAdded }: { data: ModuleEditorData; onAdded: () => void }) {
  const { module } = data
  const [filters, setFilters] = React.useState({ q: '', domainId: '', skillId: '', difficulty: '' })
  const [page, setPage] = React.useState(1)
  const [result, setResult] = React.useState<{ rows: QuestionSearchRow[]; total: number; pageSize: number } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const [adding, setAdding] = React.useState<string | null>(null)
  const inModule = new Set(data.entries.map((e) => e.questionId))

  const search = (nextPage = 1) =>
    startTransition(async () => {
      const res = await searchQuestionsAction({ moduleId: module.id, ...filters, page: nextPage })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setError(null)
      setPage(nextPage)
      setResult(res.data ?? null)
    })

  const add = async (questionId: string) => {
    setAdding(questionId)
    const res = await addQuestionAction({ moduleId: module.id, questionId })
    setAdding(null)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success('Added')
    setResult((r) => (r ? { ...r, rows: r.rows.map((row) => (row.id === questionId ? { ...row, usedInThisExam: true } : row)) } : r))
    onAdded()
  }

  const skills = data.skills.filter((s) => !filters.domainId || s.domainId === filters.domainId)
  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add from the question bank</CardTitle>
        <CardDescription>Published {module.section === 'math' ? 'Math' : 'Reading and Writing'} questions. Search the stem text or paste a question id.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            search(1)
          }}
        >
          <FormField id="qs-text" label="Search text">
            {(aria) => <Input {...aria} value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} placeholder="Words from the stem" />}
          </FormField>
          <FormField id="qs-domain" label="Domain">
            {(aria) => (
              <NativeSelect {...aria} value={filters.domainId} onChange={(e) => setFilters((f) => ({ ...f, domainId: e.target.value, skillId: '' }))}>
                <option value="">All</option>
                {data.domains.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField id="qs-skill" label="Skill">
            {(aria) => (
              <NativeSelect {...aria} value={filters.skillId} onChange={(e) => setFilters((f) => ({ ...f, skillId: e.target.value }))}>
                <option value="">All</option>
                {skills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField id="qs-difficulty" label="Difficulty">
            {(aria) => (
              <NativeSelect {...aria} value={filters.difficulty} onChange={(e) => setFilters((f) => ({ ...f, difficulty: e.target.value }))}>
                <option value="">All</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </NativeSelect>
            )}
          </FormField>
          <Button type="submit" loading={pending}>
            <Search /> Search
          </Button>
        </form>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        {result && (
          <div className="mt-4">
            {result.rows.length === 0 ? (
              <EmptyState title="No matching published questions" description="Try fewer filters, or publish more questions in the bank." />
            ) : (
              <>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {result.rows.map((q) => {
                    const used = q.usedInThisExam || inModule.has(q.id)
                    return (
                      <li key={q.id} className="flex items-start gap-3 px-3 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-2 text-sm">
                            <RichText source={q.stem} />
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            <Badge variant="outline">{q.skillName}</Badge>
                            <Badge variant={DIFFICULTY_VARIANT[q.difficulty as keyof typeof DIFFICULTY_VARIANT] ?? 'neutral'}>{q.difficulty}</Badge>
                          </div>
                        </div>
                        {used ? (
                          <Badge variant="neutral">In this exam</Badge>
                        ) : (
                          <Button size="sm" variant="secondary" loading={adding === q.id} disabled={adding !== null} onClick={() => void add(q.id)}>
                            <Plus /> Add
                          </Button>
                        )}
                      </li>
                    )
                  })}
                </ul>
                <div className="mt-3 flex items-center justify-between text-[13px] text-muted-foreground">
                  <span className="tabular">
                    {result.total} result{result.total === 1 ? '' : 's'} · page {page} of {pages}
                  </span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" disabled={page <= 1 || pending} onClick={() => search(page - 1)}>
                      Previous
                    </Button>
                    <Button size="sm" variant="secondary" disabled={page >= pages || pending} onClick={() => search(page + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
