'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, Plus, X } from 'lucide-react'
import { useDict } from '@/lib/i18n/client'
import { format } from '@/lib/i18n/dict'
import { classroomDict } from '@/lib/i18n/dictionaries/classroom'
import type { ActionResult } from '@/lib/api/errors'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/card'
import { Input, Label, Textarea } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { answerPollAction, closePollAction, createPollAction } from '@/features/classroom/poll-actions'
import type { StaffPollView, StudentPollView } from '@/features/classroom/polls'

const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0)

function useRun(onDone?: () => void) {
  const router = useRouter()
  const [pending, start] = React.useTransition()
  const run = <R,>(fn: () => Promise<ActionResult<R>>, onOk?: () => void) =>
    start(async () => {
      const res = await fn()
      if (res.ok) {
        if (res.message) toast.success(res.message)
        onOk?.()
        onDone?.()
        router.refresh()
      } else toast.error(res.error)
    })
  return { pending, run }
}

export function CreatePollForm({ workspaceId, groupId, sessionId = null, onChanged }: { workspaceId: string; groupId: string; sessionId?: string | null; onChanged?: () => void }) {
  const t = useDict(classroomDict).teach.polls
  const { pending, run } = useRun(onChanged)
  const [kind, setKind] = React.useState<'poll' | 'quiz'>('quiz')
  const [question, setQuestion] = React.useState('')
  const [options, setOptions] = React.useState(['', ''])
  const [correct, setCorrect] = React.useState(0)
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        run(
          () => createPollAction({ workspaceId, groupId, sessionId, kind, question, options, correctIndex: kind === 'quiz' ? correct : null }),
          () => {
            setQuestion('')
            setOptions(['', ''])
            setCorrect(0)
          },
        )
      }}
    >
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t.newTitle}>
        {(['quiz', 'poll'] as const).map((k) => (
          <label key={k} className={cn('cursor-pointer rounded-md border px-3 py-1.5 text-[13px]', kind === k ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong hover:bg-muted')}>
            <input type="radio" name="poll-kind" className="sr-only" checked={kind === k} onChange={() => setKind(k)} />
            {k === 'quiz' ? t.kindQuiz : t.kindPoll}
          </label>
        ))}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`poll-q-${sessionId ?? groupId}`}>{t.question}</Label>
        <Textarea id={`poll-q-${sessionId ?? groupId}`} rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} required minLength={2} maxLength={500} />
      </div>
      <ul className="space-y-2">
        {options.map((o, i) => (
          <li key={i} className="flex items-center gap-2">
            {kind === 'quiz' && (
              <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <input type="radio" name={`poll-correct-${sessionId ?? groupId}`} checked={correct === i} onChange={() => setCorrect(i)} className="size-4 accent-[var(--primary)]" aria-label={`${t.correct}: ${format(t.option, { n: i + 1 })}`} />
                {t.correct}
              </label>
            )}
            <Input
              aria-label={format(t.option, { n: i + 1 })}
              placeholder={format(t.option, { n: i + 1 })}
              value={o}
              maxLength={200}
              required
              onChange={(e) => setOptions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
            />
            {options.length > 2 && (
              <button
                type="button"
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
                aria-label={t.removeOption}
                onClick={() => {
                  setOptions((prev) => prev.filter((_, j) => j !== i))
                  setCorrect((c) => (c === i ? 0 : c > i ? c - 1 : c))
                }}
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {options.length < 6 && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setOptions((p) => [...p, ''])}>
            <Plus aria-hidden /> {t.addOption}
          </Button>
        )}
        <Button type="submit" size="sm" loading={pending}>
          {t.create}
        </Button>
      </div>
    </form>
  )
}

function Bars({ options, counts, correctIndex, myChoice, labels }: { options: string[]; counts: number[]; correctIndex: number | null; myChoice: number | null; labels: { mine: string; correct: string } }) {
  const total = counts.reduce((a, b) => a + b, 0)
  return (
    <ul className="space-y-1.5">
      {options.map((o, i) => (
        <li key={i} data-option={i}>
          <div className="mb-0.5 flex items-baseline justify-between gap-2 text-[13px]">
            <span className={cn('min-w-0 break-words', correctIndex === i ? 'font-semibold text-success' : 'text-foreground')}>
              {correctIndex === i && <Check className="mr-1 inline size-3.5" aria-hidden />}
              {o}
              {correctIndex === i && <span className="sr-only"> ({labels.correct})</span>}
              {myChoice === i && <span className="ml-1.5 text-xs text-muted-foreground">· {labels.mine}</span>}
            </span>
            <span className="shrink-0 tabular text-muted-foreground">
              {counts[i]} · {pct(counts[i] ?? 0, total)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className={cn('h-full rounded-full', correctIndex === i ? 'bg-success' : 'bg-primary/70')} style={{ width: `${pct(counts[i] ?? 0, total)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function StaffPollCard({ poll, onChanged }: { poll: StaffPollView; onChanged?: () => void }) {
  const c = useDict(classroomDict)
  const t = c.teach.polls
  const { pending, run } = useRun(onChanged)
  return (
    <article className="space-y-3 rounded-lg border border-border bg-surface p-4" data-poll={poll.id} data-status={poll.status}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-medium text-foreground">{poll.question}</p>
        <span className="flex shrink-0 items-center gap-1.5 text-xs">
          <Badge variant="neutral">{poll.kind === 'quiz' ? c.classes.pollQuiz : c.classes.pollPoll}</Badge>
          <Badge variant={poll.status === 'open' ? 'success' : 'neutral'}>{poll.status === 'open' ? t.open : t.closed}</Badge>
        </span>
      </div>
      <Bars options={poll.options} counts={poll.counts ?? []} correctIndex={poll.correctIndex} myChoice={null} labels={{ mine: '', correct: t.correct }} />
      <p className="text-xs text-muted-foreground">
        {format(t.answered, { answered: poll.answered, students: poll.students })}
        {poll.correctRate !== null && ` · ${format(t.correctRate, { rate: `${Math.round(poll.correctRate * 100)}%` })}`}
      </p>
      {poll.byStudent.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">{format(t.answered, { answered: poll.answered, students: poll.students })}</summary>
          <ul className="mt-1.5 space-y-0.5">
            {poll.byStudent.map((s) => (
              <li key={s.studentId} className="flex justify-between gap-2">
                <span className="truncate text-foreground">{s.name}</span>
                <span className={cn('shrink-0', s.choice !== null && poll.correctIndex === s.choice ? 'text-success' : 'text-muted-foreground')}>
                  {s.choice === null ? t.noAnswer : poll.options[s.choice]}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {poll.status === 'open' && (
        <Button type="button" size="sm" variant="secondary" loading={pending} onClick={() => run(() => closePollAction({ pollId: poll.id }))}>
          {t.close}
        </Button>
      )}
    </article>
  )
}

export function StudentPollCard({ poll, onChanged }: { poll: StudentPollView; onChanged?: () => void }) {
  const c = useDict(classroomDict)
  const t = c.classes
  const { pending, run } = useRun(onChanged)
  return (
    <article className="space-y-3 rounded-lg border border-border bg-surface p-4" data-poll={poll.id} data-status={poll.status}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-medium text-foreground">{poll.question}</p>
        <span className="flex shrink-0 items-center gap-1.5 text-xs">
          <Badge variant="neutral">{poll.kind === 'quiz' ? t.pollQuiz : t.pollPoll}</Badge>
          {poll.status === 'closed' && <Badge variant="neutral">{t.pollClosed}</Badge>}
        </span>
      </div>
      {poll.status === 'open' ? (
        <>
          <p className="text-xs text-muted-foreground">{t.pollChoose}</p>
          <div className="grid gap-1.5" role="radiogroup" aria-label={poll.question}>
            {poll.options.map((o, i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={poll.myChoice === i}
                disabled={pending}
                onClick={() => run(() => answerPollAction({ pollId: poll.id, choice: i }))}
                className={cn(
                  'rounded-md border px-3 py-2 text-left text-sm',
                  poll.myChoice === i ? 'border-primary bg-primary/10 font-medium text-foreground' : 'border-border-strong text-foreground hover:bg-muted',
                )}
              >
                {o}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t.pollWaiting}</p>
        </>
      ) : (
        <Bars options={poll.options} counts={poll.counts ?? []} correctIndex={poll.correctIndex} myChoice={poll.myChoice} labels={{ mine: t.pollYourAnswer, correct: t.pollCorrect }} />
      )}
    </article>
  )
}
