'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, ChevronUp, Flag, LogOut, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiFetch, ApiClientError } from '@/lib/api/client'
import { format } from '@/lib/i18n/dict'
import { useDict } from '@/lib/i18n/client'
import { examsDict } from '@/lib/i18n/dictionaries/exams'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/menus'
import { toast } from '@/components/ui/toast'
import { QuestionCard } from '@/components/learning/question-card'
import { QuestionNavigator, type NavigatorItem } from '@/components/learning/question-navigator'
import { CalculatorToggle, DesmosCalculator } from '@/components/learning/desmos-calculator'
import { sectionNumber } from '@/features/exams/machine'
import type { ExamOverview } from '@/features/exams/queries'
import type { ExamStateDTO, SavedAnswerDTO, StartExamResultDTO } from '@/features/exams/types'
import { DirectionsPopover, ExamTimer, ReferencePopover, SaveIndicator } from './exam-chrome'
import { BreakScreen, CenterMessage, InstructionsScreen, ReadyScreen, type RunnerError } from './exam-screens'
import { secondsUntil, useClock, useIsDesktop } from './use-clock'
import { useAnswerQueue } from './use-answer-queue'

type Screen = 'instructions' | 'loading' | 'error' | 'state'
const EMPTY_ANSWER: SavedAnswerDTO = { selectedOptionId: null, responseText: null, markedForReview: false, timeSpentSeconds: 0 }
const isAnswered = (a: SavedAnswerDTO | undefined) => !!(a?.selectedOptionId || a?.responseText?.trim())
const elimKey = (attemptId: string) => `sm.exam.eliminated.${attemptId}`

function readEliminations(attemptId: string): Record<string, string[]> {
  try {
    const raw = window.sessionStorage.getItem(elimKey(attemptId))
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string[]>) : {}
  } catch {
    return {}
  }
}

/**
 * The exam room. Server state (GET /api/exams/[attemptId]/state) is the source of truth; this
 * component only renders it, saves answers optimistically, and re-syncs its display timer from
 * `serverNow`/`deadlineAt` on every response. Refreshing restores everything from the server.
 */
export function ExamRunner({ overview }: { overview: ExamOverview }) {
  const t = useDict(examsDict)
  const r = t.runner
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const now = useClock()

  const [screen, setScreen] = React.useState<Screen>(overview.activeAttemptId ? 'loading' : 'instructions')
  const [state, setState] = React.useState<ExamStateDTO | null>(null)
  const [error, setError] = React.useState<RunnerError | null>(null)
  const [offset, setOffset] = React.useState(0)
  const [busy, setBusy] = React.useState<null | 'start' | 'begin' | 'submit' | 'flush'>(null)
  const [answers, setAnswers] = React.useState<Record<string, SavedAnswerDTO>>({})
  const [index, setIndex] = React.useState(0)
  const [reviewing, setReviewing] = React.useState(false)
  const [eliminated, setEliminated] = React.useState<Record<string, string[]>>({})
  const [eliminateMode, setEliminateMode] = React.useState(false)
  const [calculatorOpen, setCalculatorOpen] = React.useState(false)
  const [timerHidden, setTimerHidden] = React.useState(false)
  const [timeUp, setTimeUp] = React.useState(false)
  const [navOpen, setNavOpen] = React.useState(false)
  const [exitOpen, setExitOpen] = React.useState(false)
  const [confirm, setConfirm] = React.useState<null | { unanswered: number; unsaved: number }>(null)

  const attemptRef = React.useRef<string | null>(overview.activeAttemptId)
  const moduleRef = React.useRef<string | null>(null)
  const answersRef = React.useRef<Record<string, SavedAnswerDTO>>({})
  const spentRef = React.useRef<Record<string, number>>({})
  const enteredAtRef = React.useRef(0)
  const handledRef = React.useRef(new Set<string>()) // auto-begin / auto-submit guards
  const mainRef = React.useRef<HTMLElement>(null)

  const errorFrom = React.useCallback(
    (err: unknown): RunnerError => {
      if (err instanceof ApiClientError) {
        if (err.code === 'PLAN_REQUIRED') return { message: r.planRequired, upgrade: true }
        if (err.code === 'PLAN_LIMIT_REACHED') return { message: r.limitReached, upgrade: true }
        if (err.status === 404 || err.code === 'CONFLICT') return { message: r.notReady }
        return { message: err.message }
      }
      return { message: r.errorBody }
    },
    [r],
  )

  // ---------------------------------------------------------------------------
  // Server sync
  // ---------------------------------------------------------------------------

  const beginRef = React.useRef<(moduleId: string) => Promise<void>>(async () => {})
  const refreshRef = React.useRef<() => Promise<void>>(async () => {})
  const elimLoadedRef = React.useRef<string | null>(null)

  const queue = useAnswerQueue(state?.attemptId ?? null, {
    onSaved: (res) => setOffset(Date.parse(res.serverNow) - Date.now()),
    onRejected: (err) => {
      if (err.code === 'TIME_EXPIRED' || err.code === 'CONFLICT' || err.status === 404) void refreshRef.current()
      else toast.error(format(r.saveFailed, { message: err.message }))
    },
  })
  const { reset: resetQueue, flush: flushQueue } = queue

  const applyState = React.useCallback(
    (s: ExamStateDTO) => {
      setOffset(Date.parse(s.serverNow) - Date.now())
      if (elimLoadedRef.current !== s.attemptId) {
        elimLoadedRef.current = s.attemptId
        setEliminated(readEliminations(s.attemptId))
      }
      attemptRef.current = s.attemptId
      const moduleId = s.current?.attemptModuleId ?? null
      if (moduleId !== moduleRef.current) {
        moduleRef.current = moduleId
        resetQueue()
        answersRef.current = s.current?.answers ?? {}
        setAnswers(answersRef.current)
        spentRef.current = Object.fromEntries(Object.entries(answersRef.current).map(([k, v]) => [k, v.timeSpentSeconds]))
        enteredAtRef.current = Date.now()
        setIndex(0)
        setReviewing(false)
        setEliminateMode(false)
        setCalculatorOpen(false)
        setConfirm(null)
      }
      setState(s)
      setScreen('state')
      setError(null)
      if (s.phase === 'completed') {
        router.replace(`/dashboard/mock-exams/results/${s.attemptId}`)
        router.refresh()
      } else if (s.phase === 'ready_to_begin' && s.next?.autoBegin && !handledRef.current.has(`begin:${s.next.id}`)) {
        handledRef.current.add(`begin:${s.next.id}`)
        void beginRef.current(s.next.id)
      }
    },
    [resetQueue, router],
  )

  const refresh = React.useCallback(async () => {
    const id = attemptRef.current
    if (!id) return
    try {
      applyState(await apiFetch<ExamStateDTO>(`/api/exams/${id}/state`))
    } catch (err) {
      setError(errorFrom(err))
      setScreen('error')
    }
  }, [applyState, errorFrom])

  const begin = React.useCallback(
    async (attemptModuleId: string) => {
      const id = attemptRef.current
      if (!id) return
      setBusy('begin')
      try {
        applyState(await apiFetch<ExamStateDTO>('/api/exams/begin-module', { body: { attemptId: id, attemptModuleId } }))
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 409) await refresh()
        else {
          setError(errorFrom(err))
          setScreen('error')
        }
      } finally {
        setBusy(null)
      }
    },
    [applyState, errorFrom, refresh],
  )

  React.useEffect(() => {
    beginRef.current = begin
    refreshRef.current = refresh
  })

  const start = async () => {
    setBusy('start')
    setError(null)
    try {
      const { attemptId } = await apiFetch<StartExamResultDTO>('/api/exams/start', { body: { mockExamId: overview.id } })
      attemptRef.current = attemptId
      const s = await apiFetch<ExamStateDTO>(`/api/exams/${attemptId}/state`)
      // The instructions screen is the confirmation for module 1: start its timer right away.
      if (s.phase === 'ready_to_begin' && s.next?.sequence === 1) {
        handledRef.current.add(`begin:${s.next.id}`)
        attemptRef.current = s.attemptId
        await begin(s.next.id)
      } else applyState(s)
    } catch (err) {
      setError(errorFrom(err))
    } finally {
      setBusy(null)
    }
  }

  const submit = React.useCallback(
    async (attemptModuleId: string) => {
      const id = attemptRef.current
      if (!id) return
      setBusy('submit')
      try {
        applyState(await apiFetch<ExamStateDTO>('/api/exams/submit', { body: { attemptId: id, attemptModuleId } }))
      } catch {
        await refresh() // the server may already have finalized it (lazy expiry); its state wins
      } finally {
        setBusy(null)
        setConfirm(null)
        setTimeUp(false)
      }
    },
    [applyState, refresh],
  )

  // Initial load of an in-progress attempt (resume after refresh).
  const loadInitial = React.useEffectEvent(() => void refresh())
  React.useEffect(() => {
    if (overview.activeAttemptId) loadInitial()
  }, [overview.activeAttemptId])

  // Time up → flush (bounded by the server grace) and auto-submit. The server is authoritative anyway.
  const onTimeUp = React.useEffectEvent(async (attemptModuleId: string) => {
    if (handledRef.current.has(`submit:${attemptModuleId}`)) return
    handledRef.current.add(`submit:${attemptModuleId}`)
    setTimeUp(true)
    await Promise.race([flushQueue(), new Promise((res) => setTimeout(res, 3500))])
    await submit(attemptModuleId)
  })
  const deadlineAt = state?.phase === 'in_module' ? (state.current?.deadlineAt ?? null) : null
  const currentModuleId = state?.current?.attemptModuleId ?? null
  React.useEffect(() => {
    if (!deadlineAt || !currentModuleId) return
    const delay = Date.parse(deadlineAt) - (Date.now() + offset)
    const timer = setTimeout(() => void onTimeUp(currentModuleId), Math.max(0, delay))
    return () => clearTimeout(timer)
  }, [deadlineAt, currentModuleId, offset])

  // Break ends → begin the next section automatically.
  const onBreakOver = React.useEffectEvent((moduleId: string) => {
    if (handledRef.current.has(`begin:${moduleId}`)) return
    handledRef.current.add(`begin:${moduleId}`)
    void begin(moduleId)
  })
  const breakEndsAt = state?.phase === 'break' ? state.breakEndsAt : null
  const breakNextId = state?.phase === 'break' ? (state.next?.id ?? null) : null
  React.useEffect(() => {
    if (!breakEndsAt || !breakNextId) return
    const delay = Date.parse(breakEndsAt) - (Date.now() + offset)
    const timer = setTimeout(() => onBreakOver(breakNextId), Math.max(0, delay))
    return () => clearTimeout(timer)
  }, [breakEndsAt, breakNextId, offset])

  // Warn before leaving mid-module (the timer keeps running on the server).
  const inModule = state?.phase === 'in_module'
  React.useEffect(() => {
    if (!inModule) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [inModule])

  // ---------------------------------------------------------------------------
  // Answering
  // ---------------------------------------------------------------------------

  const current = state?.current ?? null
  const questions = React.useMemo(() => current?.questions ?? [], [current])
  const item = questions[Math.min(index, Math.max(0, questions.length - 1))]

  const secondsSpent = (aqId: string) => {
    const base = spentRef.current[aqId] ?? 0
    const live = item?.attemptQuestionId === aqId && enteredAtRef.current ? (Date.now() - enteredAtRef.current) / 1000 : 0
    return Math.round(base + live)
  }

  const record = (aqId: string, patch: Partial<SavedAnswerDTO>, debounceMs = 0) => {
    const next = { ...EMPTY_ANSWER, ...answersRef.current[aqId], ...patch }
    answersRef.current = { ...answersRef.current, [aqId]: next }
    setAnswers(answersRef.current)
    queue.enqueue(
      aqId,
      {
        selectedOptionId: next.selectedOptionId,
        responseText: next.responseText?.trim() ? next.responseText : null,
        markedForReview: next.markedForReview,
        timeSpentSeconds: secondsSpent(aqId),
      },
      debounceMs,
    )
  }

  const goTo = (nextIndex: number) => {
    if (item) {
      spentRef.current[item.attemptQuestionId] = secondsSpent(item.attemptQuestionId)
      enteredAtRef.current = Date.now()
    }
    setIndex(Math.max(0, Math.min(questions.length - 1, nextIndex)))
    setReviewing(false)
    setNavOpen(false)
    mainRef.current?.scrollTo({ top: 0 })
  }

  const toggleEliminate = (questionId: string, optionId: string) => {
    setEliminated((prev) => {
      const list = prev[questionId] ?? []
      const next = { ...prev, [questionId]: list.includes(optionId) ? list.filter((o) => o !== optionId) : [...list, optionId] }
      try {
        if (attemptRef.current) window.sessionStorage.setItem(elimKey(attemptRef.current), JSON.stringify(next))
      } catch {
        // storage unavailable (private mode): eliminations stay in memory
      }
      return next
    })
  }

  const requestSubmit = async () => {
    setBusy('flush')
    const saved = await queue.flush()
    setBusy(null)
    setConfirm({
      unanswered: questions.filter((q) => !isAnswered(answersRef.current[q.attemptQuestionId])).length,
      unsaved: saved ? 0 : queue.pendingCount(),
    })
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (screen === 'instructions') {
    return <InstructionsScreen overview={overview} resuming={false} busy={busy === 'start' || busy === 'begin'} error={error} onStart={start} />
  }
  if (screen === 'error') {
    return (
      <CenterMessage
        title={r.errorTitle}
        body={error?.message ?? r.errorBody}
        action={
          <>
            <Button onClick={() => void refresh()}>{r.retry}</Button>
            <Button variant="secondary" asChild>
              <Link href="/dashboard/mock-exams">{r.backToList}</Link>
            </Button>
          </>
        }
      />
    )
  }
  if (!state) return <CenterMessage title={r.loading} spinner />

  if (state.phase === 'completed') return <CenterMessage title={r.completedTitle} body={r.completedBody} spinner />

  if (state.phase === 'break' && state.next) {
    return (
      <BreakScreen
        remaining={secondsUntil(state.breakEndsAt, now, offset)}
        nextSection={state.next.section}
        questions={state.next.questionCount}
        minutes={Math.round(state.next.durationSeconds / 60)}
        busy={busy === 'begin'}
        onResume={() => {
          handledRef.current.add(`begin:${state.next!.id}`)
          void begin(state.next!.id)
        }}
      />
    )
  }

  if (state.phase === 'ready_to_begin') {
    const next = state.next
    if (!next || next.autoBegin) {
      return (
        <CenterMessage
          title={r.preparingModule}
          spinner={busy === 'begin' || !next}
          action={
            busy !== 'begin' && next ? (
              <Button onClick={() => void begin(next.id)}>{r.beginSection}</Button>
            ) : !next ? (
              <Button variant="secondary" onClick={() => void refresh()}>
                {r.retry}
              </Button>
            ) : undefined
          }
        />
      )
    }
    if (next.sequence === 1) {
      return <InstructionsScreen overview={overview} resuming busy={busy === 'begin'} error={error} onStart={() => void begin(next.id)} />
    }
    return (
      <ReadyScreen
        section={next.section}
        minutes={Math.round(next.durationSeconds / 60)}
        questions={next.questionCount}
        busy={busy === 'begin'}
        onBegin={() => void begin(next.id)}
      />
    )
  }

  if (!current || !item) return <CenterMessage title={r.loading} spinner />

  const remaining = secondsUntil(current.deadlineAt, now, offset)
  const isMath = current.section === 'math'
  const total = questions.length
  const answer = answers[item.attemptQuestionId] ?? EMPTY_ANSWER
  const navItems: NavigatorItem[] = questions.map((q, i) => ({
    index: i,
    answered: isAnswered(answers[q.attemptQuestionId]),
    flagged: answers[q.attemptQuestionId]?.markedForReview ?? false,
  }))
  const moduleTitle = format(t.common.moduleLabel, {
    section: sectionNumber(current.section),
    module: current.moduleNumber,
    name: t.sections[current.section],
  })
  const elim = new Set(eliminated[item.question.id] ?? [])
  const calculatorKey = `${state.attemptId}:${current.attemptModuleId}`
  const unansweredCount = navItems.filter((n) => !n.answered).length
  const flaggedCount = navItems.filter((n) => n.flagged).length

  const calculator = isMath && calculatorOpen && (
    isDesktop ? (
      <aside className="hidden w-[min(460px,40vw)] shrink-0 flex-col border-l border-border bg-surface p-3 lg:flex" aria-label={r.calculator}>
        <DesmosCalculator stateKey={calculatorKey} className="h-full flex-1" />
      </aside>
    ) : (
      <div className="fixed inset-0 z-40 flex flex-col bg-surface lg:hidden" role="dialog" aria-modal="true" aria-label={r.calculator}>
        <div className="flex h-12 items-center justify-between border-b border-border px-3">
          <span className="text-sm font-semibold">{r.calculator}</span>
          <Button variant="ghost" size="icon-sm" aria-label={r.close} onClick={() => setCalculatorOpen(false)}>
            <X />
          </Button>
        </div>
        <div className="min-h-0 flex-1 p-2">
          <DesmosCalculator stateKey={calculatorKey} className="h-full" />
        </div>
      </div>
    )
  )

  return (
    <div className="flex h-dvh flex-col bg-surface pb-[var(--app-inset-bottom)]">
      {/* Top bar: section/module + directions · timer · tools */}
      <header className="grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border px-3 sm:px-5">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold sm:text-sm">{moduleTitle}</p>
          <DirectionsPopover section={current.section} />
        </div>
        <ExamTimer remaining={remaining} hidden={timerHidden} onToggle={() => setTimerHidden((h) => !h)} />
        <div className="flex items-center justify-end gap-1.5">
          {isMath && (
            <>
              <CalculatorToggle pressed={calculatorOpen} onPressedChange={setCalculatorOpen} showLabel={isDesktop} />
              <ReferencePopover />
            </>
          )}
          <Button variant="ghost" size="sm" onClick={() => setExitOpen(true)} aria-label={r.exit}>
            <LogOut />
            <span className="hidden sm:inline">{r.exit}</span>
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main ref={mainRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto" id="main">
          {reviewing ? (
            <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
              <h1 className="text-[26px] font-semibold">{r.reviewTitle}</h1>
              <p className="mt-2 text-[15px] text-muted-foreground">{r.reviewBody}</p>
              <div className="mt-6 rounded-xl border border-border p-4 sm:p-6">
                <p className="mb-4 text-sm font-semibold">{moduleTitle}</p>
                <QuestionNavigator items={navItems} current={-1} onJump={goTo} />
              </div>
              <p className="mt-4 text-sm text-muted-foreground tabular">
                {format(r.unanswered, { n: unansweredCount })} · {format(r.flagged, { n: flaggedCount })}
              </p>
              <Button size="lg" className="mt-6" onClick={() => void requestSubmit()} loading={busy === 'flush' || busy === 'submit'}>
                {r.submitModule}
              </Button>
            </div>
          ) : (
            <QuestionCard
              key={item.attemptQuestionId}
              question={item.question}
              number={item.position}
              layout="split"
              showMeta={false}
              className="mx-auto min-h-full max-w-[1400px] rounded-none border-0 bg-transparent"
              selectedOptionId={answer.selectedOptionId}
              responseText={answer.responseText ?? ''}
              onSelectOption={(optionId) => {
                if (elim.has(optionId)) toggleEliminate(item.question.id, optionId)
                record(item.attemptQuestionId, { selectedOptionId: optionId })
              }}
              onResponseChange={(text) => record(item.attemptQuestionId, { responseText: text }, 600)}
              eliminated={elim}
              onToggleEliminate={eliminateMode ? (optionId) => toggleEliminate(item.question.id, optionId) : undefined}
              disabled={timeUp || busy === 'submit'}
              headerActions={
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-pressed={answer.markedForReview}
                    onClick={() => record(item.attemptQuestionId, { markedForReview: !answer.markedForReview })}
                    className={cn(answer.markedForReview && 'text-warning-foreground')}
                  >
                    <Flag className={cn(answer.markedForReview && 'fill-warning text-warning')} />
                    <span className="hidden sm:inline">{answer.markedForReview ? r.markedForReview : r.markForReview}</span>
                  </Button>
                  {item.question.questionType === 'multiple_choice' && (
                    <Button
                      variant={eliminateMode ? 'secondary' : 'ghost'}
                      size="sm"
                      aria-pressed={eliminateMode}
                      onClick={() => setEliminateMode((m) => !m)}
                      title={eliminateMode ? r.eliminateOn : r.eliminate}
                    >
                      <span className="text-[12px] font-semibold line-through decoration-2" aria-hidden>
                        ABC
                      </span>
                      <span className="sr-only sm:not-sr-only">{r.eliminate}</span>
                    </Button>
                  )}
                </>
              }
            />
          )}
        </main>
        {calculator}
      </div>

      {/* Bottom bar: save status · navigator · back/next */}
      <footer className="grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-border px-3 sm:px-5">
        <SaveIndicator status={queue.status} />
        <Popover open={navOpen} onOpenChange={setNavOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex h-10 items-center gap-1.5 rounded-md bg-navy-900 px-3 text-[13px] font-semibold text-white tabular hover:bg-navy-800 dark:bg-primary sm:px-4"
            >
              {format(r.questionOf, { n: reviewing ? '—' : index + 1, total })}
              <ChevronUp className="size-4" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="center" className="w-[min(26rem,calc(100vw-1.5rem))]">
            <p className="mb-3 text-sm font-semibold">{moduleTitle}</p>
            <QuestionNavigator items={navItems} current={reviewing ? -1 : index} onJump={goTo} />
            <Button
              variant="secondary"
              className="mt-4 w-full"
              onClick={() => {
                setReviewing(true)
                setNavOpen(false)
              }}
            >
              {r.goToReview}
            </Button>
          </PopoverContent>
        </Popover>
        <div className="flex items-center justify-end gap-2">
          {(index > 0 || reviewing) && (
            <Button variant="secondary" onClick={() => (reviewing ? setReviewing(false) : goTo(index - 1))}>
              <ChevronLeft className="sm:hidden" />
              <span className="hidden sm:inline">{r.back}</span>
              <span className="sr-only sm:hidden">{r.back}</span>
            </Button>
          )}
          {!reviewing && (
            <Button onClick={() => (index >= total - 1 ? setReviewing(true) : goTo(index + 1))}>
              <span className="hidden sm:inline">{r.next}</span>
              <span className="sr-only sm:hidden">{r.next}</span>
              <ChevronRight className="sm:hidden" />
            </Button>
          )}
        </div>
      </footer>

      {timeUp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40" role="alertdialog" aria-live="assertive">
          <div className="rounded-xl border border-border bg-popover px-6 py-5 text-center shadow-overlay">
            <p className="font-semibold">{r.timeUp}</p>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={r.confirmTitle}
        description={r.confirmBody}
        confirmLabel={confirm && confirm.unsaved > 0 ? r.submitAnyway : r.submitModule}
        cancelLabel={r.keepWorking}
        destructive={!!confirm && confirm.unsaved > 0}
        loading={busy === 'submit'}
        onConfirm={() => submit(current.attemptModuleId)}
      >
        {confirm && (confirm.unanswered > 0 || confirm.unsaved > 0) && (
          <div className="space-y-2 text-sm">
            {confirm.unanswered > 0 && <p className="text-warning-foreground">{format(r.confirmUnanswered, { n: confirm.unanswered })}</p>}
            {confirm.unsaved > 0 && <p className="text-destructive">{format(r.confirmUnsaved, { n: confirm.unsaved })}</p>}
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={exitOpen}
        onOpenChange={setExitOpen}
        title={r.exitTitle}
        description={r.exitBody}
        confirmLabel={r.exitConfirm}
        cancelLabel={r.keepWorking}
        onConfirm={async () => {
          await queue.flush()
          router.push('/dashboard/mock-exams')
        }}
      />
    </div>
  )
}
