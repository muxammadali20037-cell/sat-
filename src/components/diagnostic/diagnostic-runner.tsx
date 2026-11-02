'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Clock, CloudOff, Eye, EyeOff, Flag, Loader2 } from 'lucide-react'
import { apiFetch, ApiClientError } from '@/lib/api/client'
import { useDict } from '@/lib/i18n/client'
import { format } from '@/lib/i18n/dict'
import { diagnosticDict } from '@/lib/i18n/dictionaries/diagnostic'
import { cn, formatClock } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { QuestionCard } from '@/components/learning/question-card'
import { QuestionNavigator } from '@/components/learning/question-navigator'
import { clockOffsetMs, crossedWarnings, remainingSeconds } from '@/features/diagnostic/clock'
import type { SafeQuestion } from '@/types/questions'
import { CalculatorSheet, CalculatorSidePanel, CalculatorToggleButton, useCalculator } from '@/components/practice/calculator-panel'

export type DiagnosticRunnerItem = {
  question: SafeQuestion
  selectedOptionId: string | null
  responseText: string | null
  markedForReview: boolean
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type Patch = { selectedOptionId?: string | null; responseText?: string | null; markedForReview?: boolean }
type SaveResponse = { serverNow: string; deadlineAt: string | null }

const SPR_DEBOUNCE_MS = 600
const LABELS = ['A', 'B', 'C', 'D'] as const

/** Timed diagnostic: server-synced countdown, immediate saves, no feedback until finished. */
export function DiagnosticRunner({
  attemptId,
  title,
  initialItems,
  deadlineAt: initialDeadline,
  serverNow,
}: {
  attemptId: string
  title: string
  initialItems: DiagnosticRunnerItem[]
  deadlineAt: string | null
  serverNow: string
}) {
  const t = useDict(diagnosticDict)
  const router = useRouter()
  const resultsUrl = `/dashboard/results/${attemptId}`

  const [items, setItems] = React.useState(initialItems)
  const [index, setIndex] = React.useState(() => {
    const firstOpen = initialItems.findIndex((i) => !i.selectedOptionId && !i.responseText)
    return firstOpen === -1 ? 0 : firstOpen
  })
  const [deadlineAt, setDeadlineAt] = React.useState(initialDeadline)
  const [remaining, setRemaining] = React.useState<number | null>(null)
  const [announcement, setAnnouncement] = React.useState('')
  const [timerHidden, setTimerHidden] = React.useState(false)
  const [saveState, setSaveState] = React.useState<Record<string, SaveState>>({})
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [finishing, setFinishing] = React.useState(false)
  const [finishError, setFinishError] = React.useState<string | null>(null)
  const [eliminated, setEliminated] = React.useState<Record<string, string[]>>({})

  const pending = React.useRef(new Map<string, Patch>())
  const timers = React.useRef(new Map<string, number>())
  const inflight = React.useRef(new Map<string, Promise<boolean>>())
  const finished = React.useRef(false)
  /** Server clock − client clock (ms); first measured from the page render, then on every save. */
  const offset = React.useRef<number | null>(null)

  const total = items.length
  const current = items[index]
  const answeredCount = items.filter((i) => i.selectedOptionId || i.responseText).length
  const flaggedCount = items.filter((i) => i.markedForReview).length
  const calculator = useCalculator(current?.question.subjectCode === 'math')
  const hasMath = items.some((i) => i.question.subjectCode === 'math')
  const sidePanelOpen = calculator.isDesktop && calculator.open

  const syncFromServer = (res: SaveResponse, startedAt: number) => {
    offset.current = clockOffsetMs(res.serverNow, Date.now(), Date.now() - startedAt)
    if (res.deadlineAt) setDeadlineAt(res.deadlineAt)
  }

  const goToResults = () => {
    finished.current = true
    router.replace(resultsUrl)
    router.refresh()
  }

  const handleTerminal = (err: unknown): boolean => {
    if (!(err instanceof ApiClientError)) return false
    if (err.code === 'TIME_EXPIRED') {
      toast.info(t.errors.timeExpired)
      goToResults()
      return true
    }
    if (err.code === 'CONFLICT' && (err.details as { reason?: string } | undefined)?.reason === 'finished') {
      goToResults()
      return true
    }
    return false
  }

  /** Sends the merged pending patch for a question; retries with backoff on network errors. */
  async function flush(questionId: string, attempt = 0): Promise<void> {
    const prior = inflight.current.get(questionId)
    if (prior) await prior
    const patch = pending.current.get(questionId)
    if (!patch || finished.current) return
    pending.current.delete(questionId)
    setSaveState((s) => ({ ...s, [questionId]: 'saving' }))
    const startedAt = Date.now()
    const run = (async (): Promise<boolean> => {
      try {
        const res = await apiFetch<SaveResponse>('/api/diagnostic/answer', { method: 'POST', body: { attemptId, questionId, ...patch } })
        syncFromServer(res, startedAt)
        setSaveState((s) => ({ ...s, [questionId]: pending.current.has(questionId) ? 'saving' : 'saved' }))
        return true
      } catch (err) {
        if (handleTerminal(err)) return false
        // Keep the patch (merged under any newer edits) and retry.
        pending.current.set(questionId, { ...patch, ...(pending.current.get(questionId) ?? {}) })
        setSaveState((s) => ({ ...s, [questionId]: 'error' }))
        const retryable = err instanceof ApiClientError && (err.code === 'NETWORK_ERROR' || err.status >= 500 || err.code === 'RATE_LIMITED')
        if (retryable && attempt < 5) {
          window.setTimeout(() => void flush(questionId, attempt + 1), Math.min(8000, 1000 * 2 ** attempt))
        } else if (!retryable) {
          pending.current.delete(questionId)
          toast.error(err instanceof ApiClientError && err.code === 'VALIDATION_FAILED' ? t.errors.invalidOption : t.errors.generic)
        }
        return false
      }
    })()
    inflight.current.set(questionId, run)
    const ok = await run
    if (inflight.current.get(questionId) === run) inflight.current.delete(questionId)
    // Newer edits made while this save was in flight (failed saves retry on their own backoff timer).
    if (ok && pending.current.has(questionId) && !timers.current.has(questionId)) await flush(questionId)
  }

  const queue = (questionId: string, patch: Patch, debounceMs = 0) => {
    pending.current.set(questionId, { ...(pending.current.get(questionId) ?? {}), ...patch })
    setSaveState((s) => ({ ...s, [questionId]: 'saving' }))
    const existing = timers.current.get(questionId)
    if (existing) window.clearTimeout(existing)
    if (debounceMs > 0) {
      timers.current.set(
        questionId,
        window.setTimeout(() => {
          timers.current.delete(questionId)
          void flush(questionId)
        }, debounceMs),
      )
    } else {
      timers.current.delete(questionId)
      void flush(questionId)
    }
  }

  const update = (questionId: string, patch: Patch, debounceMs = 0) => {
    if (finished.current) return
    setItems((prev) =>
      prev.map((it) =>
        it.question.id === questionId
          ? {
              ...it,
              ...(patch.selectedOptionId !== undefined ? { selectedOptionId: patch.selectedOptionId } : {}),
              ...(patch.responseText !== undefined ? { responseText: patch.responseText } : {}),
              ...(patch.markedForReview !== undefined ? { markedForReview: patch.markedForReview } : {}),
            }
          : it,
      ),
    )
    queue(questionId, patch, debounceMs)
  }

  const flushAll = async () => {
    for (const [id, handle] of timers.current) {
      window.clearTimeout(handle)
      timers.current.delete(id)
    }
    await Promise.all([...pending.current.keys(), ...inflight.current.keys()].map((id) => flush(id)))
  }

  const finish = async (auto = false) => {
    if (finished.current) return
    setFinishing(true)
    setFinishError(null)
    try {
      await flushAll()
      await apiFetch('/api/diagnostic/finish', { method: 'POST', body: { attemptId } })
      goToResults()
    } catch (err) {
      if (handleTerminal(err)) return
      setFinishing(false)
      setFinishError(t.runner.finishFailed)
      if (auto) window.setTimeout(() => void finish(true), 3000)
    }
  }

  // Countdown, derived from the server deadline and the measured clock offset.
  const onTick = React.useEffectEvent(() => {
    if (offset.current === null) offset.current = clockOffsetMs(serverNow, Date.now())
    const next = remainingSeconds(deadlineAt, offset.current, Date.now())
    setRemaining((prev) => {
      const crossed = crossedWarnings(prev, next)
      if (crossed.includes(60)) setAnnouncement(t.runner.oneMinute)
      else if (crossed.includes(300)) setAnnouncement(t.runner.fiveMinutes)
      return next
    })
    if (next === 0 && !finished.current && !finishing) {
      setAnnouncement(t.runner.timeUp)
      void finish(true)
    }
  })
  React.useEffect(() => {
    const first = window.setTimeout(() => onTick(), 0)
    const id = window.setInterval(() => onTick(), 1000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(id)
    }
  }, [])

  // Warn before leaving with unsaved changes.
  React.useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (pending.current.size > 0 || inflight.current.size > 0) e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  const go = (next: number) => {
    if (next < 0 || next >= total) return
    setIndex(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const onKey = React.useEffectEvent((e: KeyboardEvent) => {
    if (!current || confirmOpen || e.metaKey || e.ctrlKey || e.altKey) return
    const target = e.target as HTMLElement | null
    const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    if (typing || current.question.questionType !== 'multiple_choice') return
    const i = LABELS.indexOf(e.key.toUpperCase() as (typeof LABELS)[number])
    const option = i >= 0 ? current.question.options.find((o) => o.label === LABELS[i]) : undefined
    if (option) {
      e.preventDefault()
      update(current.question.id, { selectedOptionId: option.id })
    }
  })
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (!current) return null
  const qid = current.question.id
  const state = saveState[qid] ?? 'idle'
  const eliminatedSet = new Set(eliminated[qid] ?? [])
  const toggleEliminate = (optionId: string) => {
    setEliminated((e) => {
      const list = e[qid] ?? []
      return { ...e, [qid]: list.includes(optionId) ? list.filter((x) => x !== optionId) : [...list, optionId] }
    })
  }
  const navigator = (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="mb-3 text-sm font-medium">{t.runner.navigator}</p>
      <QuestionNavigator
        items={items.map((it, i) => ({ index: i, answered: !!(it.selectedOptionId || it.responseText), flagged: it.markedForReview }))}
        current={index}
        onJump={go}
      />
    </div>
  )
  const low = remaining !== null && remaining <= 300

  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-20 -mx-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{title}</p>
            <p className="text-[13px] text-muted-foreground tabular">{format(t.runner.answered, { answered: answeredCount, total })}</p>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-9 min-w-24 items-center justify-center gap-1.5 rounded-md border px-3 text-sm font-semibold tabular',
                low ? 'border-warning bg-warning-soft text-warning-foreground' : 'border-border bg-card',
              )}
              role="timer"
              aria-label={t.runner.timeLeft}
            >
              <Clock className="size-4" aria-hidden />
              {timerHidden ? <span className="text-[13px] font-normal text-muted-foreground">{t.runner.timerHidden}</span> : remaining === null ? '—' : formatClock(remaining)}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={timerHidden ? t.runner.showTimer : t.runner.hideTimer}
              aria-pressed={timerHidden}
              onClick={() => setTimerHidden((h) => !h)}
            >
              {timerHidden ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
            </Button>
            {hasMath && <CalculatorToggleButton state={calculator} />}
            <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={finishing}>
              {t.runner.finish}
            </Button>
          </div>
        </div>
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </div>

      {finishError && (
        <Alert variant="destructive" icon={<AlertTriangle className="text-destructive" />}>
          {finishError}
        </Alert>
      )}
      {finishing && !finishError && (
        <Alert variant="neutral" icon={<Loader2 className="animate-spin" />}>
          {remaining === 0 ? t.runner.timeUp : t.runner.submitting}
        </Alert>
      )}

      <div className={cn('grid grid-cols-1 gap-6', sidePanelOpen ? 'lg:grid-cols-[minmax(0,1fr)_minmax(22rem,40%)]' : 'lg:grid-cols-[minmax(0,1fr)_18rem]')}>
        <div className="min-w-0 space-y-4">
          <QuestionCard
            key={qid}
            question={current.question}
            number={index + 1}
            total={total}
            showMeta={false}
            layout={sidePanelOpen ? 'stacked' : 'split'}
            eliminated={eliminatedSet}
            onToggleEliminate={toggleEliminate}
            selectedOptionId={current.selectedOptionId}
            responseText={current.responseText ?? ''}
            onSelectOption={(id) => update(qid, { selectedOptionId: id })}
            onResponseChange={(text) => update(qid, { responseText: text }, SPR_DEBOUNCE_MS)}
            disabled={finishing}
            headerActions={
              <Button
                variant={current.markedForReview ? 'secondary' : 'ghost'}
                size="sm"
                aria-pressed={current.markedForReview}
                onClick={() => update(qid, { markedForReview: !current.markedForReview })}
                disabled={finishing}
              >
                <Flag className={cn(current.markedForReview && 'fill-warning text-warning')} aria-hidden />
                <span className="hidden sm:inline">{current.markedForReview ? t.runner.marked : t.runner.mark}</span>
                <span className="sr-only sm:hidden">{current.markedForReview ? t.runner.marked : t.runner.mark}</span>
              </Button>
            }
            footer={
              <div className="flex flex-wrap items-center justify-between gap-3 text-[13px]">
                <SaveStatus state={state} t={t.runner} />
                {(current.selectedOptionId || current.responseText) && (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() =>
                      update(qid, current.question.questionType === 'multiple_choice' ? { selectedOptionId: null } : { responseText: null })
                    }
                    disabled={finishing}
                  >
                    {t.runner.clear}
                  </Button>
                )}
              </div>
            }
          />
          <p className="text-[13px] text-muted-foreground">{t.runner.noFeedback}</p>
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => go(index - 1)} disabled={index === 0}>
              <ChevronLeft aria-hidden /> {t.runner.previous}
            </Button>
            {index < total - 1 ? (
              <Button variant="secondary" onClick={() => go(index + 1)}>
                {t.runner.next} <ChevronRight aria-hidden />
              </Button>
            ) : (
              <Button onClick={() => setConfirmOpen(true)} disabled={finishing}>
                {t.runner.finish}
              </Button>
            )}
          </div>
          {sidePanelOpen && navigator}
        </div>

        {!sidePanelOpen && <aside className="lg:sticky lg:top-24 lg:self-start">{navigator}</aside>}
        {/* Stable slot: a collapsed calculator stays mounted (hidden) so its graphs survive. */}
        {hasMath && <CalculatorSidePanel state={calculator} labels={t.calculator} stateKey={`diagnostic-${attemptId}`} />}
      </div>
      {hasMath && <CalculatorSheet state={calculator} labels={t.calculator} stateKey={`diagnostic-${attemptId}`} />}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t.runner.finishTitle}
        description={format(t.runner.finishBody, { answered: answeredCount, total })}
        confirmLabel={t.runner.finishConfirm}
        cancelLabel={t.runner.keepWorking}
        loading={finishing}
        onConfirm={async () => {
          await finish()
          setConfirmOpen(false)
        }}
      >
        {flaggedCount > 0 && (
          <p className="flex items-center gap-2 text-sm text-warning-foreground">
            <Flag className="size-4 fill-warning text-warning" aria-hidden />
            {flaggedCount === 1 ? t.runner.finishFlaggedOne : format(t.runner.finishFlagged, { n: flaggedCount })}
          </p>
        )}
      </ConfirmDialog>
    </div>
  )
}

function SaveStatus({ state, t }: { state: SaveState; t: { saved: string; saving: string; saveFailed: string } }) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground" aria-live="polite">
      {state === 'saving' && (
        <>
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> {t.saving}
        </>
      )}
      {state === 'saved' && (
        <>
          <Check className="size-3.5 text-success" aria-hidden /> {t.saved}
        </>
      )}
      {state === 'error' && (
        <span className="flex items-center gap-1.5 text-warning-foreground">
          <CloudOff className="size-3.5" aria-hidden /> {t.saveFailed}
        </span>
      )}
    </span>
  )
}
