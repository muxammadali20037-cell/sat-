'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  BookOpen,
  CircleCheck,
  CircleX,
  History,
  Lightbulb,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  Search,
  SendHorizontal,
  Sparkles,
  WandSparkles,
  Wand2,
} from 'lucide-react'
import { apiFetch, ApiClientError } from '@/lib/api/client'
import { useDict } from '@/lib/i18n/client'
import { format } from '@/lib/i18n/dict'
import { tutorDict } from '@/lib/i18n/dictionaries/tutor'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Alert, Badge } from '@/components/ui/card'
import { Textarea } from '@/components/ui/input'
import { ProgressBar } from '@/components/ui/progress'
import { EmptyState } from '@/components/ui/states'
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/dialog'
import { RichText } from '@/components/learning/rich-text'
import { QuestionCard } from '@/components/learning/question-card'
import { UpgradeNotice } from '@/components/subscription/upgrade-notice'
import { TutorResponseView } from './tutor-response'
import { GeneratedPracticeCard } from './generated-practice-card'
import {
  MAX_STUDENT_MESSAGE,
  practiceHref,
  type ChatMessageView,
  type GeneratedReveal,
  type HintLevel,
  type RelatedInfo,
  type TutorStructured,
  type TutorTurnResponse,
  type UsageInfo,
} from '@/features/ai-tutor/schemas'
import type { TutorPageData, TutorSessionItem } from '@/features/ai-tutor/page-data'

type Pending = { label: string; text?: string } | null
type ErrorState = { code: string; message: string } | null
type Dict = typeof tutorDict.en

export function TutorWorkspace({ data }: { data: TutorPageData }) {
  const t = useDict(tutorDict)
  const [sessions, setSessions] = React.useState<TutorSessionItem[]>(data.sessions)
  const [session, setSession] = React.useState(data.session)
  const [messages, setMessages] = React.useState<ChatMessageView[]>(data.messages)
  const [related, setRelated] = React.useState<RelatedInfo>(data.related)
  const [usage, setUsage] = React.useState<UsageInfo>(data.usage)
  const [pending, setPending] = React.useState<Pending>(null)
  const [error, setError] = React.useState<ErrorState>(null)
  const [input, setInput] = React.useState('')
  const [showQuestion, setShowQuestion] = React.useState(true)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const endRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLTextAreaElement>(null)
  const mounted = React.useRef(false)

  const ctx = data.context
  const question = ctx?.question ?? null
  const canExplain = Boolean(question && ctx?.access.explain)
  const canHint = Boolean(question && ctx?.access.hint)
  const [aboutQuestion, setAboutQuestion] = React.useState(canExplain || canHint)

  const aiOff = data.availability === 'none'
  const planRequired = usage.limit === 0
  const remaining = usage.limit === null ? null : Math.max(0, usage.limit - usage.used)
  const limitReached = remaining === 0
  const blocked = aiOff || limitReached
  const busy = pending !== null

  const usedHintLevel = messages.reduce(
    (max, m) => (m.role === 'assistant' && m.mode === 'hint' && m.questionId === ctx?.questionId ? Math.max(max, m.hintLevel ?? 0) : max),
    0,
  )
  const nextHintLevel = Math.min(3, usedHintLevel + 1) as HintLevel

  React.useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    endRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' })
  }, [messages.length, pending])

  function rememberSession(id: string, title: string) {
    setSession({ id, title })
    setSessions((prev) => [{ id, title, updatedAt: new Date().toISOString() }, ...prev.filter((s) => s.id !== id)])
    const params = new URLSearchParams(window.location.search)
    if (params.get('session') !== id) {
      params.set('session', id)
      window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`)
    }
  }

  async function call(endpoint: string, body: Record<string, unknown>, pendingInfo: NonNullable<Pending>): Promise<boolean> {
    setError(null)
    setPending(pendingInfo)
    try {
      const res = await apiFetch<TutorTurnResponse>(endpoint, { body: { ...body, ...(session ? { sessionId: session.id } : {}) } })
      rememberSession(res.sessionId, res.sessionTitle)
      setMessages((prev) => [...prev, res.userMessage, res.assistantMessage])
      if (res.related) setRelated(res.related)
      setUsage(res.usage)
      return true
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === 'PLAN_LIMIT_REACHED') {
          const d = (err.details ?? {}) as { used?: number; limit?: number }
          const limit = d.limit ?? usage.limit ?? 0
          setUsage({ used: limit, limit })
        }
        setError({ code: err.code, message: err.code === 'RATE_LIMITED' ? t.errors.rateLimited : err.message })
      } else {
        setError({ code: 'INTERNAL_ERROR', message: t.errors.generic })
      }
      return false
    } finally {
      setPending(null)
    }
  }

  async function sendText(text: string) {
    const message = text.trim().slice(0, MAX_STUDENT_MESSAGE)
    if (!message || busy || blocked) return false
    if (question && aboutQuestion && canExplain) {
      return call('/api/ai/explain', { questionId: question.id, message }, { label: t.conversation.modes.explain, text: message })
    }
    if (question && aboutQuestion && canHint) {
      return call('/api/ai/hint', { questionId: question.id, level: nextHintLevel, message }, { label: t.conversation.modes.hint, text: message })
    }
    return call('/api/ai/chat', { message }, { label: t.conversation.modes.chat, text: message })
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    const ok = await sendText(input)
    if (ok) setInput('')
  }

  const explain = () =>
    question && call('/api/ai/explain', { questionId: question.id }, { label: t.conversation.explainRequest })
  const hint = (level: HintLevel) =>
    question && call('/api/ai/hint', { questionId: question.id, level }, { label: format(t.conversation.hintRequest, { level }) })
  const generateBody = question ? { questionId: question.id } : related ? { skillId: related.skillId } : null
  const generate = () =>
    generateBody && call('/api/ai/generate-practice', generateBody, { label: t.related.generating })

  function quick(kind: 'explainDifferently' | 'simplify' | 'findMistake') {
    const prompt = t.quick.prompts[kind]
    if (question && aboutQuestion && canExplain) {
      void call('/api/ai/explain', { questionId: question.id, message: prompt }, { label: t.quick[kind], text: prompt })
      return
    }
    if (kind === 'findMistake') {
      setInput((v) => (v.trim() ? v : t.quick.findMistakePrefill))
      inputRef.current?.focus()
      return
    }
    void call('/api/ai/chat', { message: prompt }, { label: t.quick[kind], text: prompt })
  }

  const hasConversation = messages.length > 0
  const relatedHref = related ? practiceHref(related) : null

  const history = (
    <HistoryPanel
      t={t}
      sessions={sessions}
      activeId={session?.id ?? null}
      recent={data.recentQuestions}
      onNavigate={() => setHistoryOpen(false)}
    />
  )

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_18rem]">
      {/* Left: history (desktop) */}
      <aside className="hidden min-h-0 lg:block lg:h-[calc(100dvh-12rem)] lg:min-h-[32rem]" aria-label={t.history.title}>
        <div className="h-full overflow-y-auto rounded-xl border border-border bg-card">{history}</div>
      </aside>

      {/* Main: conversation */}
      <section
        className="flex min-h-[60dvh] min-w-0 flex-col rounded-xl border border-border bg-card lg:h-[calc(100dvh-12rem)] lg:min-h-[32rem]"
        aria-label={t.title}
      >
        <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <Drawer open={historyOpen} onOpenChange={setHistoryOpen}>
            <DrawerTrigger asChild>
              <Button variant="ghost" size="sm" className="-ml-2 lg:hidden">
                <History aria-hidden /> {t.history.open}
              </Button>
            </DrawerTrigger>
            <DrawerContent side="left" title={t.history.title} className="overflow-y-auto">
              {history}
            </DrawerContent>
          </Drawer>
          <h2 className="min-w-0 flex-1 truncate font-sans text-[15px] font-semibold">{session?.title ?? t.history.newConversation}</h2>
          {data.availability === 'mock' && <Badge variant="warning">{t.mockLabel}</Badge>}
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5" aria-live="polite" aria-busy={busy}>
          {aiOff && (
            <Alert variant="warning" title={t.notConfigured}>
              {t.notConfiguredBody}
            </Alert>
          )}
          {data.availability === 'mock' && <Alert variant="neutral">{t.mockNotice}</Alert>}

          {ctx && (
            <ContextBlock
              t={t}
              ctx={ctx}
              show={showQuestion}
              onToggle={() => setShowQuestion((s) => !s)}
              canExplain={canExplain}
              canHint={canHint}
              nextHintLevel={nextHintLevel}
              usedHintLevel={usedHintLevel}
              disabled={busy || blocked}
              onExplain={() => void explain()}
              onHint={(level) => void hint(level)}
            />
          )}

          {!hasConversation && !busy && !ctx && (
            <EmptyState icon={<Sparkles />} title={t.conversation.emptyTitle} description={t.conversation.emptyBody} className="border-none" />
          )}

          {messages.map((m) => (
            <MessageItem
              key={m.id}
              t={t}
              message={m}
              related={related}
              reveal={m.structured?.kind === 'generated_practice' ? (data.generatedReveals[m.structured.generated.id] ?? null) : null}
            />
          ))}

          {pending && (
            <div className="space-y-3">
              <UserBubble label={pending.label} text={pending.text} />
              <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 className="size-4 animate-spin" aria-hidden /> {t.conversation.thinking}
              </p>
            </div>
          )}

          {error && <ErrorBlock t={t} error={error} usage={usage} onDismiss={() => setError(null)} />}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={submit}
          className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] rounded-b-xl border-t border-border bg-card p-3 sm:bottom-0 lg:static"
        >
          {question && (canExplain || canHint) && (
            <label className="mb-2 inline-flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground">
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                checked={aboutQuestion}
                onChange={(e) => setAboutQuestion(e.target.checked)}
              />
              {t.context.aboutQuestion}
            </label>
          )}
          <div className="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              aria-label={t.composer.label}
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, MAX_STUDENT_MESSAGE))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void submit()
                }
              }}
              rows={2}
              placeholder={limitReached ? t.composer.disabledLimit : question && aboutQuestion ? t.composer.placeholderQuestion : t.composer.placeholder}
              disabled={blocked}
              className="max-h-40 min-h-12 resize-none"
            />
            <Button type="submit" size="icon" aria-label={t.composer.send} disabled={!input.trim() || busy || blocked} loading={busy}>
              {!busy && <SendHorizontal aria-hidden />}
            </Button>
          </div>
          <p className="mt-1.5 hidden justify-between text-xs text-muted-foreground sm:flex">
            <span>{t.composer.shortcut}</span>
            <span className="tabular">
              {input.length}/{MAX_STUDENT_MESSAGE}
            </span>
          </p>
        </form>
      </section>

      {/* Right: follow-ups, usage, related */}
      <aside className="min-w-0 space-y-4 lg:col-span-2 xl:col-span-1 xl:h-[calc(100dvh-12rem)] xl:min-h-[32rem] xl:overflow-y-auto" aria-label={t.related.title}>
        <UsagePanel t={t} usage={usage} planRequired={planRequired} />

        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="font-sans text-[15px] font-semibold">{t.quick.title}</h3>
          <div className="mt-3 grid grid-cols-1 gap-1">
            {(['explainDifferently', 'simplify', 'findMistake'] as const).map((kind) => {
              const Icon = kind === 'explainDifferently' ? RefreshCw : kind === 'simplify' ? Wand2 : Search
              const enabled = !busy && !blocked && (hasConversation || canExplain || kind === 'findMistake')
              return (
                <Button key={kind} variant="ghost" size="sm" className="justify-start" disabled={!enabled} onClick={() => quick(kind)}>
                  <Icon aria-hidden className="text-muted-foreground" /> {t.quick[kind]}
                </Button>
              )
            })}
            {canHint && !canExplain && (
              <Button variant="ghost" size="sm" className="justify-start" disabled={busy || blocked || usedHintLevel >= 3} onClick={() => void hint(nextHintLevel)}>
                <Lightbulb aria-hidden className="text-muted-foreground" /> {t.quick.nextHint}
              </Button>
            )}
          </div>
          {!hasConversation && !canExplain && <p className="mt-2 text-xs text-muted-foreground">{t.quick.needsConversation}</p>}
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="font-sans text-[15px] font-semibold">{t.related.title}</h3>
          {related ? (
            <div className="mt-2 space-y-4">
              <div>
                <p className="font-medium text-foreground">{related.skillName}</p>
                <p className="text-[13px] text-muted-foreground">{related.domainName}</p>
              </div>
              <div>
                <p className="text-[13px] font-medium text-muted-foreground">{t.related.lessons}</p>
                {related.lessons.length > 0 ? (
                  <ul className="mt-1.5 space-y-1">
                    {related.lessons.map((l) => (
                      <li key={l.id}>
                        <Link href={`/dashboard/lesson/${l.id}`} className="flex items-start gap-2 rounded-md px-1 py-1 text-sm text-primary hover:bg-muted">
                          <BookOpen className="mt-0.5 size-4 shrink-0" aria-hidden />
                          <span className="min-w-0">{l.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">{t.related.noLessons}</p>
                )}
              </div>
              {relatedHref && (
                <Button asChild variant="secondary" size="sm" className="w-full">
                  <Link href={relatedHref}>{t.related.practice}</Link>
                </Button>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">{t.related.none}</p>
          )}
          <div className="mt-4 border-t border-border pt-4">
            <Button className="w-full" variant="primary" size="sm" disabled={!generateBody || busy || blocked} onClick={() => void generate()}>
              <WandSparkles aria-hidden /> {t.related.generate}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">{generateBody ? t.related.generateHelp : t.related.generateDisabled}</p>
          </div>
        </section>
      </aside>
    </div>
  )
}

// ---------------------------------------------------------------------------

function HistoryPanel({
  t,
  sessions,
  activeId,
  recent,
  onNavigate,
}: {
  t: Dict
  sessions: TutorSessionItem[]
  activeId: string | null
  recent: TutorPageData['recentQuestions']
  onNavigate: () => void
}) {
  return (
    <div className="flex flex-col gap-5 p-3">
      <Button asChild variant="secondary" size="sm" className="w-full">
        <Link href="/dashboard/ai-tutor" onClick={onNavigate}>
          <MessageSquarePlus aria-hidden /> {t.history.newConversation}
        </Link>
      </Button>
      <nav aria-label={t.history.title}>
        <h3 className="px-2 text-xs font-medium text-muted-foreground">{t.history.title}</h3>
        {sessions.length === 0 ? (
          <p className="px-2 pt-1.5 text-sm text-muted-foreground">{t.history.empty}</p>
        ) : (
          <ul className="mt-1.5 space-y-0.5">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/dashboard/ai-tutor?session=${s.id}`}
                  onClick={onNavigate}
                  aria-current={s.id === activeId ? 'page' : undefined}
                  className={cn(
                    'block truncate rounded-md px-2 py-1.5 text-sm transition-colors',
                    s.id === activeId ? 'bg-primary-soft font-medium text-primary' : 'text-foreground hover:bg-muted',
                  )}
                >
                  {s.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </nav>
      <section>
        <h3 className="px-2 text-xs font-medium text-muted-foreground">{t.history.recentQuestions}</h3>
        {recent.length === 0 ? (
          <p className="px-2 pt-1.5 text-sm text-muted-foreground">{t.history.recentEmpty}</p>
        ) : (
          <ul className="mt-1.5 space-y-0.5">
            {recent.map((q) => (
              <li key={q.questionId}>
                <Link
                  href={`/dashboard/ai-tutor?questionId=${q.questionId}`}
                  onClick={onNavigate}
                  className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  {q.isCorrect ? (
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-label={t.history.correct} />
                  ) : (
                    <CircleX className="mt-0.5 size-4 shrink-0 text-destructive" aria-label={t.history.incorrect} />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-foreground">{q.skillName}</span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">{q.excerpt}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function ContextBlock({
  t,
  ctx,
  show,
  onToggle,
  canExplain,
  canHint,
  nextHintLevel,
  usedHintLevel,
  disabled,
  onExplain,
  onHint,
}: {
  t: Dict
  ctx: NonNullable<TutorPageData['context']>
  show: boolean
  onToggle: () => void
  canExplain: boolean
  canHint: boolean
  nextHintLevel: HintLevel
  usedHintLevel: number
  disabled: boolean
  onExplain: () => void
  onHint: (level: HintLevel) => void
}) {
  if (!ctx.question) {
    const message =
      ctx.access.reason === 'in_timed_test' ? t.context.inTimedTest : ctx.access.reason === 'not_encountered' ? t.context.notEncountered : t.context.unavailable
    return <Alert variant={ctx.access.reason === 'in_timed_test' ? 'warning' : 'neutral'} title={t.context.title}>{message}</Alert>
  }
  const actions = (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {canExplain && (
          <Button size="sm" onClick={onExplain} disabled={disabled}>
            <Sparkles aria-hidden /> {t.context.explain}
          </Button>
        )}
        {canHint &&
          ([1, 2, 3] as const).map((level) => (
            <Button
              key={level}
              size="sm"
              variant={level === nextHintLevel && !canExplain ? 'primary' : 'secondary'}
              onClick={() => onHint(level)}
              disabled={disabled || level > usedHintLevel + 1}
            >
              <Lightbulb aria-hidden /> {format(t.context.hint, { level })}
            </Button>
          ))}
      </div>
      {canHint && <p className="text-xs text-muted-foreground">{t.context.hintHelp}</p>}
      {!canExplain && canHint && <p className="text-xs text-muted-foreground">{t.context.notAnswered}</p>}
    </div>
  )
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-sans text-[13px] font-medium text-muted-foreground">{t.context.title}</h3>
        <Button variant="link" size="sm" onClick={onToggle} aria-expanded={show}>
          {show ? t.context.hide : t.context.show}
        </Button>
      </div>
      {show ? (
        <QuestionCard question={ctx.question} reveal={ctx.reveal} disabled showMeta footer={actions} />
      ) : (
        actions
      )}
    </div>
  )
}

function UserBubble({ label, text }: { label: string; text?: string | null }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-lg bg-primary-soft px-3.5 py-2.5 text-[15px] text-foreground">
        {text ? (
          <>
            <p className="mb-0.5 text-xs font-medium text-primary">{label}</p>
            <RichText source={text} />
          </>
        ) : (
          <p className="font-medium">{label}</p>
        )}
      </div>
    </div>
  )
}

function MessageItem({
  t,
  message,
  related,
  reveal,
}: {
  t: Dict
  message: ChatMessageView
  related: RelatedInfo
  reveal: GeneratedReveal | null
}) {
  if (message.role === 'user') {
    const label =
      message.mode === 'explain'
        ? t.conversation.explainRequest
        : message.mode === 'hint'
          ? format(t.conversation.hintRequest, { level: message.hintLevel ?? 1 })
          : message.mode === 'generate'
            ? t.conversation.generateRequest
            : t.conversation.you
    return <UserBubble label={label} text={message.content || null} />
  }
  const s = message.structured
  if (s?.kind === 'tutor') {
    const href = related && s.meta.relatedSkillId === related.skillId ? practiceHref(related) : null
    return <TutorResponseView structured={s as TutorStructured} practiceHref={href} />
  }
  if (s?.kind === 'generated_practice') {
    return <GeneratedPracticeCard generated={s.generated} initialReveal={reveal} mock={s.meta.provider === 'mock'} />
  }
  return <RichText source={message.content} className="reading text-[15px] text-foreground" />
}

function UsagePanel({ t, usage, planRequired }: { t: Dict; usage: UsageInfo; planRequired: boolean }) {
  if (planRequired) {
    return <UpgradeNotice title={t.usage.planRequiredTitle} description={t.usage.planRequiredBody} actionLabel={t.usage.seePlans} />
  }
  if (usage.limit === null) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-medium text-foreground">{t.usage.unlimited}</p>
      </section>
    )
  }
  const remaining = Math.max(0, usage.limit - usage.used)
  if (remaining === 0) {
    return (
      <UpgradeNotice
        title={t.usage.limitTitle}
        description={format(t.usage.limitBody, { limit: usage.limit })}
        actionLabel={t.usage.seePlans}
      />
    )
  }
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-medium text-foreground">
        {remaining === 1 ? t.usage.leftOne : format(t.usage.left, { n: remaining })}
      </p>
      <ProgressBar
        className="mt-2"
        size="sm"
        value={usage.used}
        max={usage.limit}
        tone={remaining <= 1 ? 'warning' : 'primary'}
        label={format(t.usage.of, { used: usage.used, limit: usage.limit })}
      />
      <p className="mt-1.5 text-xs text-muted-foreground tabular">{format(t.usage.of, { used: usage.used, limit: usage.limit })}</p>
    </section>
  )
}

function ErrorBlock({ t, error, usage, onDismiss }: { t: Dict; error: NonNullable<ErrorState>; usage: UsageInfo; onDismiss: () => void }) {
  if (error.code === 'PLAN_LIMIT_REACHED') {
    return <UpgradeNotice title={t.usage.limitTitle} description={format(t.usage.limitBody, { limit: usage.limit ?? 0 })} actionLabel={t.usage.seePlans} />
  }
  if (error.code === 'PLAN_REQUIRED') {
    return <UpgradeNotice title={t.usage.planRequiredTitle} description={t.usage.planRequiredBody} actionLabel={t.usage.seePlans} />
  }
  if (error.code === 'AI_NOT_CONFIGURED') {
    return <Alert variant="warning" title={t.notConfigured}>{t.notConfiguredBody}</Alert>
  }
  return (
    <Alert
      variant="destructive"
      title={error.message}
      action={
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          {t.errors.dismiss}
        </Button>
      }
    />
  )
}
