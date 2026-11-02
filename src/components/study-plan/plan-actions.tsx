'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, CircleCheck, CircleDashed, RefreshCw, SkipForward, Undo2 } from 'lucide-react'
import { apiFetch, ApiClientError } from '@/lib/api/client'
import { useDict } from '@/lib/i18n/client'
import { studyPlanDict } from '@/lib/i18n/dictionaries/study-plan'
import { format } from '@/lib/i18n/dict'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { UpgradeNotice } from '@/components/subscription/upgrade-notice'

type GenerateOutcome = { planId: string; generatedBy: 'rules' | 'rules_ai'; taskCount: number; aiNote: 'not_configured' | 'limit_reached' | 'failed' | null }

/** "Create my plan" / "Regenerate plan" (with confirmation). */
export function PlanGenerateButton({ mode }: { mode: 'create' | 'regenerate' }) {
  const t = useDict(studyPlanDict)
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [planRequired, setPlanRequired] = React.useState(false)

  async function run() {
    setPending(true)
    try {
      const res = await apiFetch<GenerateOutcome>('/api/ai/study-plan', { method: 'POST', body: {} })
      const note =
        res.aiNote === 'not_configured'
          ? t.actions.aiNotConfigured
          : res.aiNote === 'limit_reached'
            ? t.actions.aiLimit
            : res.aiNote === 'failed'
              ? t.actions.aiFailed
              : undefined
      toast.success(mode === 'create' ? t.actions.created : t.actions.regenerated, note ? { description: note } : undefined)
      setOpen(false)
      router.refresh()
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'PLAN_REQUIRED') setPlanRequired(true)
      else toast.error(err instanceof ApiClientError ? err.message : t.errors.generic)
    } finally {
      setPending(false)
    }
  }

  if (planRequired) return <UpgradeNotice title={t.upgradeTitle} description={t.upgradeBody} actionLabel={t.upgradeAction} />

  if (mode === 'create') {
    return (
      <Button onClick={run} loading={pending}>
        {t.empty.generate}
      </Button>
    )
  }
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <RefreshCw aria-hidden /> {t.actions.regenerate}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t.actions.regenerateTitle}
        description={t.actions.regenerateBody}
        confirmLabel={t.actions.regenerate}
        loading={pending}
        onConfirm={run}
      />
    </>
  )
}

export type TaskView = {
  id: string
  date: string
  type: 'lesson' | 'practice' | 'review' | 'mock_exam' | 'diagnostic'
  title: string
  detail: string | null
  minutes: number
  status: 'pending' | 'completed' | 'skipped'
  href: string | null
}

/** One task with Start / Mark complete / Skip / Undo. */
export function TaskItem({ task, compact = false }: { task: TaskView; compact?: boolean }) {
  const t = useDict(studyPlanDict)
  const router = useRouter()
  const [status, setStatus] = React.useState(task.status)
  const [pending, setPending] = React.useState<null | TaskView['status']>(null)

  async function update(next: TaskView['status']) {
    setPending(next)
    try {
      await apiFetch(`/api/study-plan/tasks/${task.id}`, { method: 'PATCH', body: { status: next } })
      setStatus(next)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : t.errors.generic)
    } finally {
      setPending(null)
    }
  }

  const done = status === 'completed'
  const skipped = status === 'skipped'

  return (
    <li className={cn('flex flex-col gap-3 py-3 sm:flex-row sm:items-center', compact && 'py-2')}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5 shrink-0" aria-hidden>
          {done ? (
            <CircleCheck className="size-5 text-success" />
          ) : skipped ? (
            <SkipForward className="size-5 text-muted-foreground" />
          ) : (
            <CircleDashed className="size-5 text-muted-foreground" />
          )}
        </span>
        <div className="min-w-0">
          <p className={cn('font-medium text-foreground', (done || skipped) && 'text-muted-foreground line-through decoration-1')}>
            {task.title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Badge variant="outline">{t.types[task.type]}</Badge>
            <span className="tabular">{format(t.task.minutes, { n: task.minutes })}</span>
            {done && <Badge variant="success">{t.task.completed}</Badge>}
            {skipped && <Badge variant="neutral">{t.task.skipped}</Badge>}
          </div>
          {!compact && task.detail && status === 'pending' && <p className="mt-1 text-xs text-muted-foreground">{task.detail}</p>}
        </div>
      </div>
      {!compact && (
        <div className="flex shrink-0 flex-wrap gap-2 pl-8 sm:pl-0">
          {status === 'pending' ? (
            <>
              {task.href && (
                <Button asChild size="sm">
                  <Link href={task.href}>
                    {t.task.start} <ArrowRight aria-hidden />
                  </Link>
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => update('completed')} loading={pending === 'completed'} disabled={pending !== null}>
                <Check aria-hidden /> {t.task.complete}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => update('skipped')} loading={pending === 'skipped'} disabled={pending !== null}>
                {t.task.skip}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => update('pending')} loading={pending === 'pending'} disabled={pending !== null}>
              <Undo2 aria-hidden /> {t.task.undo}
            </Button>
          )}
        </div>
      )}
    </li>
  )
}
