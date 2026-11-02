'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, ChevronLeft, Clock, Languages, Sparkles, X } from 'lucide-react'
import { apiFetch, ApiClientError } from '@/lib/api/client'
import { useDict } from '@/lib/i18n/client'
import { format } from '@/lib/i18n/dict'
import { practiceDict } from '@/lib/i18n/dictionaries/practice'
import { cn, formatClock } from '@/lib/utils'
import { parseSprResponse } from '@/lib/scoring'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress'
import { Alert } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { QuestionCard } from '@/components/learning/question-card'
import { UpgradeNotice } from '@/components/subscription/upgrade-notice'
import type { RevealedAnswer, SafeQuestion } from '@/types/questions'
import { BookmarkButton } from './bookmark-button'
import { CalculatorSheet, CalculatorSidePanel, CalculatorToggleButton, useCalculator } from './calculator-panel'
import { errorDetails, isPlanLimit, practiceErrorMessage } from './error-message'

export type RunnerItem = {
  position: number
  question: SafeQuestion
  reveal: RevealedAnswer | null
  bookmarked: boolean
}

type Draft = { selectedOptionId: string | null; responseText: string }
type Progress = { answeredCount: number; correctCount: number }
type AnswerResponse = { isCorrect: boolean; reveal: RevealedAnswer; progress: Progress }

const LABELS = ['A', 'B', 'C', 'D'] as const

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable
}

/** Focused, one-question-at-a-time practice with immediate, server-scored feedback. */
export function PracticeRunner({
  attemptId,
  title,
  difficultyLabel,
  initialItems,
  initialIndex,
  initialProgress,
  guideSlugs = {},
  guideLabel,
}: {
  attemptId: string
  title: string
  difficultyLabel: string | null
  initialItems: RunnerItem[]
  initialIndex: number
  /** Counters from the attempt row (recomputed server-side from stored answers). */
  initialProgress: Progress
  /** skillId → study-guide slug, for the "guide in Uzbek" link after answering. */
  guideSlugs?: Record<string, string>
  guideLabel?: string
}) {
  const t = useDict(practiceDict)
  const router = useRouter()
  const [items, setItems] = React.useState(initialItems)
  const [index, setIndex] = React.useState(() => Math.min(Math.max(0, initialIndex), Math.max(0, initialItems.length - 1)))
  const [progress, setProgress] = React.useState(initialProgress)
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({})
  const [eliminated, setEliminated] = React.useState<Record<string, string[]>>({})
  const [elapsed, setElapsed] = React.useState<Record<string, number>>({})
  const [checking, setChecking] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [limit, setLimit] = React.useState<{ used: number; limit: number } | null>(null)
  const [planRequired, setPlanRequired] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [finishing, setFinishing] = React.useState(false)

  const item = items[index]
  const current = item?.question
  const answered = !!item?.reveal
  const total = items.length
  const incorrectCount = Math.max(0, progress.answeredCount - progress.correctCount)
  const allAnswered = total > 0 && progress.answeredCount >= total
  const calculator = useCalculator(current?.subjectCode === 'math')
  const sessionHasMath = items.some((i) => i.question.subjectCode === 'math')

  // Per-question elapsed time, counted only while the page is visible (the server clamps it).
  const onSecond = React.useEffectEvent(() => {
    if (!current || answered || document.visibilityState !== 'visible') return
    const id = current.id
    setElapsed((e) => ({ ...e, [id]: (e[id] ?? 0) + 1 }))
  })
  React.useEffect(() => {
    const id = window.setInterval(() => onSecond(), 1000)
    return () => window.clearInterval(id)
  }, [])
  const elapsedSeconds = current ? (elapsed[current.id] ?? 0) : 0

  const draft: Draft = (current && drafts[current.id]) || { selectedOptionId: null, responseText: '' }
  const setDraft = (patch: Partial<Draft>) => {
    if (!current) return
    setError(null)
    setDrafts((d) => ({ ...d, [current.id]: { ...draft, ...patch } }))
  }
  const eliminatedSet = React.useMemo(() => new Set(current ? (eliminated[current.id] ?? []) : []), [eliminated, current])
  const toggleEliminate = (optionId: string) => {
    if (!current) return
    const id = current.id
    setEliminated((e) => {
      const list = e[id] ?? []
      return { ...e, [id]: list.includes(optionId) ? list.filter((x) => x !== optionId) : [...list, optionId] }
    })
    if (draft.selectedOptionId === optionId) setDraft({ selectedOptionId: null })
  }

  const go = (next: number) => {
    if (next < 0 || next >= total) return
    setError(null)
    setIndex(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submit() {
    if (!current || answered || checking) return
    const spr = current.questionType === 'student_produced_response'
    if (!spr && !draft.selectedOptionId) return setError(t.runner.chooseFirst)
    if (spr) {
      const parsed = parseSprResponse(draft.responseText)
      if (!parsed.ok) return setError(parsed.reason === 'empty' ? t.runner.enterFirst : t.errors.sprInvalid)
    }
    setChecking(true)
    setError(null)
    try {
      const res = await apiFetch<AnswerResponse>('/api/practice/answer', {
        method: 'POST',
        body: {
          attemptId,
          questionId: current.id,
          selectedOptionId: spr ? null : draft.selectedOptionId,
          responseText: spr ? draft.responseText : null,
          timeSpentSeconds: elapsed[current.id] ?? 0,
        },
      })
      setItems((prev) => prev.map((it) => (it.question.id === current.id ? { ...it, reveal: res.reveal } : it)))
      setProgress(res.progress)
    } catch (err) {
      if (isPlanLimit(err)) {
        const details = errorDetails<{ used: number; limit: number }>(err)
        if ((err as ApiClientError).code === 'PLAN_REQUIRED') setPlanRequired(true)
        else setLimit({ used: details.used ?? 0, limit: details.limit ?? 0 })
      } else if (err instanceof ApiClientError && err.code === 'CONFLICT' && (err.details as { reason?: string } | undefined)?.reason === 'session_finished') {
        router.replace(`/dashboard/results/${attemptId}`)
      } else {
        setError(practiceErrorMessage(err, t.errors))
      }
    } finally {
      setChecking(false)
    }
  }

  async function finish() {
    setFinishing(true)
    try {
      await apiFetch('/api/practice/finish', { method: 'POST', body: { attemptId } })
      router.push(`/dashboard/results/${attemptId}`)
    } catch {
      toast.error(t.runner.finishFailed)
      setFinishing(false)
    }
  }

  function requestFinish() {
    if (allAnswered) void finish()
    else setConfirmOpen(true)
  }

  function primaryAction() {
    if (!answered) return void submit()
    if (index < total - 1) return go(index + 1)
    requestFinish()
  }

  const onKey = React.useEffectEvent((e: KeyboardEvent) => {
    if (!current || confirmOpen || e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key === 'Enter') {
      const target = e.target as HTMLElement | null
      // Buttons and links handle their own Enter; Enter inside the SPR input submits.
      if (target && (target.tagName === 'BUTTON' || target.tagName === 'A' || target.closest('[role="dialog"]'))) return
      e.preventDefault()
      primaryAction()
      return
    }
    if (isTypingTarget(e.target) || answered || current.questionType !== 'multiple_choice') return
    const i = LABELS.indexOf(e.key.toUpperCase() as (typeof LABELS)[number])
    const option = i >= 0 ? current.options.find((o) => o.label === LABELS[i]) : undefined
    if (option) {
      e.preventDefault()
      setDraft({ selectedOptionId: option.id })
    }
  })
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (!current) return null

  const isLast = index === total - 1
  const primaryLabel = !answered ? t.runner.check : isLast ? t.runner.finish : t.runner.next
  const sidePanelOpen = calculator.isDesktop && calculator.open

  return (
    <div>
      {/* Focused top bar */}
      <div className="sticky top-0 z-20 -mx-4 mb-5 border-b border-border bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <Button asChild variant="secondary" size="sm">
            <Link href="/dashboard/practice">
              <X aria-hidden /> {t.runner.exit}
            </Link>
          </Button>
          <div className="min-w-0 text-center">
            <p className="truncate text-sm font-semibold">
              {title}
              {difficultyLabel && <span className="text-muted-foreground"> · {difficultyLabel}</span>}
            </p>
            <p className="truncate text-xs text-muted-foreground tabular">
              {format(t.runner.questionsCount, { n: total })} · {format(t.runner.answeredCount, { n: progress.answeredCount })}
            </p>
          </div>
          <div className="flex items-center justify-end gap-1">
            {sessionHasMath && <CalculatorToggleButton state={calculator} />}
            <Button variant="ghost" size="sm" onClick={requestFinish} disabled={finishing}>
              {t.runner.finish}
            </Button>
          </div>
        </div>
      </div>

      <div className={cn('grid grid-cols-1 gap-6', sidePanelOpen && 'lg:grid-cols-[minmax(0,1fr)_minmax(22rem,42%)]')}>
        <div className={cn('mx-auto w-full min-w-0 space-y-4', !sidePanelOpen && 'max-w-3xl')}>
          <ProgressBar value={progress.answeredCount} max={total} label={t.runner.progressLabel} size="sm" />

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <p className="text-sm font-semibold text-primary tabular">{format(t.runner.questionOf, { n: index + 1, total })}</p>
            <div className="flex items-center gap-3 text-sm font-medium tabular">
              <span className="flex items-center gap-1 text-success">
                <Check className="size-4" aria-hidden />
                <span aria-hidden>{progress.correctCount}</span>
                <span className="sr-only">{format(t.runner.correctCount, { n: progress.correctCount })}</span>
              </span>
              <span className="flex items-center gap-1 text-destructive">
                <X className="size-4" aria-hidden />
                <span aria-hidden>{incorrectCount}</span>
                <span className="sr-only">{format(t.runner.incorrectCount, { n: incorrectCount })}</span>
              </span>
              <span className="flex items-center gap-1 font-normal text-muted-foreground" title={t.runner.timeOnQuestion}>
                <Clock className="size-3.5" aria-hidden />
                <span className="sr-only">{t.runner.timeOnQuestion}: </span>
                {formatClock(elapsedSeconds)}
              </span>
            </div>
          </div>

          {limit && <UpgradeNotice title={t.usage.limitTitle} description={format(t.usage.limitBody, { limit: limit.limit })} actionLabel={t.usage.seePlans} />}
          {planRequired && <UpgradeNotice title={t.usage.disabledTitle} description={t.usage.disabledBody} actionLabel={t.usage.seePlans} />}

          <QuestionCard
            key={current.id}
            question={current}
            selectedOptionId={draft.selectedOptionId}
            responseText={draft.responseText}
            onSelectOption={(id) => setDraft({ selectedOptionId: id })}
            onResponseChange={(text) => setDraft({ responseText: text })}
            reveal={item.reveal}
            disabled={checking}
            eliminated={eliminatedSet}
            onToggleEliminate={toggleEliminate}
            headerActions={
              <BookmarkButton
                questionId={current.id}
                bookmarked={item.bookmarked}
                onChange={(b) => setItems((prev) => prev.map((it) => (it.question.id === current.id ? { ...it, bookmarked: b } : it)))}
              />
            }
            footer={
              answered ? (
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/dashboard/ai-tutor?questionId=${current.id}`}>
                      <Sparkles aria-hidden /> {t.runner.askAi}
                    </Link>
                  </Button>
                  {guideLabel && guideSlugs[current.skillId] && (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/dashboard/guides/${guideSlugs[current.skillId]}`}>
                        <Languages aria-hidden /> {guideLabel}
                      </Link>
                    </Button>
                  )}
                </div>
              ) : null
            }
          />

          {error && (
            <Alert variant="destructive" className="py-3">
              {error}
            </Alert>
          )}
          {allAnswered && <Alert variant="success">{t.runner.allAnswered}</Alert>}

          <Button
            size="lg"
            className="w-full"
            onClick={primaryAction}
            loading={checking || (finishing && isLast && answered)}
            disabled={!answered && (!!limit || planRequired)}
          >
            {primaryLabel}
          </Button>

          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" onClick={() => go(index - 1)} disabled={index === 0}>
              <ChevronLeft aria-hidden /> {t.runner.previous}
            </Button>
            <p className="hidden text-xs text-muted-foreground sm:block">{t.runner.keyboardHint}</p>
          </div>

          <nav aria-label={t.runner.strip} className="rounded-lg border border-border bg-card p-3">
            <ol className="flex flex-wrap gap-1.5">
              {items.map((it, i) => {
                const state = it.reveal ? (it.reveal.isCorrect ? 'correct' : 'incorrect') : 'open'
                const label = format(
                  state === 'correct' ? t.runner.jumpCorrect : state === 'incorrect' ? t.runner.jumpIncorrect : t.runner.jumpUnanswered,
                  { n: i + 1 },
                )
                return (
                  <li key={it.question.id}>
                    <button
                      type="button"
                      onClick={() => go(i)}
                      aria-label={label}
                      aria-current={i === index ? 'step' : undefined}
                      className={cn(
                        'flex size-10 items-center justify-center rounded-md text-[13px] font-semibold tabular transition-colors',
                        state === 'correct' && 'bg-success-soft text-success',
                        state === 'incorrect' && 'bg-destructive-soft text-destructive',
                        state === 'open' && 'border border-dashed border-border-strong hover:bg-muted',
                        i === index && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                      )}
                    >
                      {i + 1}
                    </button>
                  </li>
                )
              })}
            </ol>
          </nav>
        </div>

        {sessionHasMath && <CalculatorSidePanel state={calculator} labels={t.calculator} stateKey={`practice-${attemptId}`} />}
      </div>
      {sessionHasMath && <CalculatorSheet state={calculator} labels={t.calculator} stateKey={`practice-${attemptId}`} />}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t.runner.finishTitle}
        description={format(t.runner.finishBody, { answered: progress.answeredCount, total })}
        confirmLabel={t.runner.finishConfirm}
        cancelLabel={t.runner.keepGoing}
        loading={finishing}
        onConfirm={finish}
      />
    </div>
  )
}
