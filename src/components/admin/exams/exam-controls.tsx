'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { Wand2 } from 'lucide-react'
import { autoFillExamAction, createFilledMockAction, setExamStatusAction, setModuleDurationAction } from '@/features/exams/admin-actions'

type Status = 'draft' | 'published' | 'archived'

/** Publish (validated server-side) / move to draft / archive. */
export function ExamStatusActions({
  examId,
  status,
  canPublish,
  activeAttempts,
}: {
  examId: string
  status: Status
  canPublish: boolean
  activeAttempts: number
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [confirm, setConfirm] = React.useState<Status | null>(null)

  const run = (next: Status) =>
    startTransition(async () => {
      const res = await setExamStatusAction({ examId, status: next })
      setConfirm(null)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(res.message ?? 'Saved')
      router.refresh()
    })

  const warning =
    activeAttempts > 0
      ? `${activeAttempts} student${activeAttempts === 1 ? ' has' : 's have'} this exam in progress. They can finish it, but nobody can start it while it is not published.`
      : 'Students will no longer be able to start this exam.'

  return (
    <div className="flex flex-wrap gap-2">
      {status !== 'published' && (
        <Button onClick={() => run('published')} loading={pending && confirm === null} disabled={!canPublish || pending}>
          Publish
        </Button>
      )}
      {status === 'published' && (
        <Button variant="secondary" onClick={() => setConfirm('draft')} disabled={pending}>
          Move to draft
        </Button>
      )}
      {status !== 'archived' && (
        <Button variant="ghost" onClick={() => setConfirm('archived')} disabled={pending}>
          Archive
        </Button>
      )}
      {status === 'archived' && (
        <Button variant="secondary" onClick={() => run('draft')} disabled={pending}>
          Restore to draft
        </Button>
      )}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === 'archived' ? 'Archive this exam?' : 'Move this exam to draft?'}
        description={warning}
        confirmLabel={confirm === 'archived' ? 'Archive exam' : 'Move to draft'}
        destructive={confirm === 'archived'}
        loading={pending}
        onConfirm={() => {
          if (confirm) run(confirm)
        }}
      />
    </div>
  )
}

export function ModuleDurationForm({ moduleId, minutes, editable }: { moduleId: string; minutes: number; editable: boolean }) {
  const router = useRouter()
  const [value, setValue] = React.useState(String(minutes))
  const [pending, startTransition] = React.useTransition()
  if (!editable) return <span className="tabular">{minutes} min</span>
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        startTransition(async () => {
          const res = await setModuleDurationAction({ moduleId, minutes: value })
          if (!res.ok) toast.error(res.error)
          else {
            toast.success('Saved')
            router.refresh()
          }
        })
      }}
    >
      <Input
        aria-label="Duration in minutes"
        type="number"
        min={1}
        max={120}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 w-20"
      />
      <span className="text-[13px] text-muted-foreground">min</span>
      {value !== String(minutes) && (
        <Button size="sm" variant="secondary" type="submit" loading={pending}>
          Save
        </Button>
      )}
    </form>
  )
}

/** "Auto-fill all modules": fills every module of a draft exam in one go (keeps questions already placed). */
export function AutoFillExamButton({ examId }: { examId: string }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  return (
    <Button
      variant="secondary"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await autoFillExamAction({ examId })
          if (!res.ok) toast.error(res.error)
          else if (res.data && res.data.shortfall > 0) toast.warning(res.message ?? 'Added')
          else toast.success(res.message ?? 'Added')
          router.refresh()
        })
      }
    >
      <Wand2 /> Auto-fill all modules
    </Button>
  )
}

/** "Create and fill a full mock": the next SAT Mock Test N as a draft with all six modules filled. */
export function CreateFilledMockButton() {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  return (
    <Button
      variant="secondary"
      loading={pending}
      data-testid="create-filled-mock"
      onClick={() =>
        startTransition(async () => {
          const res = await createFilledMockAction()
          if (!res.ok) {
            toast.error(res.error)
            return
          }
          if (res.data && res.data.shortfall > 0) toast.warning(res.message ?? 'Created')
          else toast.success(res.message ?? 'Created')
          if (res.data) router.push(`/admin/exams/${res.data.id}`)
        })
      }
    >
      <Wand2 /> Create and fill a full mock
    </Button>
  )
}
