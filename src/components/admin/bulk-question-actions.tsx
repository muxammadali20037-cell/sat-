'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { bulkSetQuestionStatusAction } from '@/features/content/bulk-question-actions'

export const BULK_FORM_ID = 'bulk-questions'

/** Toolbar for the question bank. Row checkboxes join this form through `form={BULK_FORM_ID}`. */
export function BulkQuestionActions({ canPublish }: { canPublish: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const run = (status: 'reviewed' | 'published' | 'draft' | 'archived') => (fd: FormData) =>
    start(async () => {
      const ids = fd.getAll('ids').map(String)
      if (ids.length === 0) {
        toast.error('Select questions first.')
        return
      }
      const res = await bulkSetQuestionStatusAction(ids, status)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(res.message ?? 'Done')
      if (res.data?.failures.length) toast.error(res.data.failures[0]!)
      router.refresh()
    })

  return (
    <form id={BULK_FORM_ID} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
      <span className="mr-1 text-muted-foreground">With selected:</span>
      <Button type="submit" size="sm" variant="secondary" formAction={run('reviewed')} disabled={pending}>
        Mark reviewed
      </Button>
      {canPublish && (
        <>
          <Button type="submit" size="sm" formAction={run('published')} disabled={pending}>
            Publish reviewed
          </Button>
          <Button type="submit" size="sm" variant="ghost" formAction={run('draft')} disabled={pending}>
            Move to draft
          </Button>
          <Button type="submit" size="sm" variant="ghost" formAction={run('archived')} disabled={pending}>
            Archive
          </Button>
        </>
      )}
    </form>
  )
}

/** Header checkbox: selects every row checkbox of the bulk form on this page. */
export function SelectAllRows({ label = 'Select all on this page' }: { label?: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      className="size-4 accent-primary"
      onChange={(e) => {
        document.querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${BULK_FORM_ID}"]`).forEach((box) => {
          box.checked = e.currentTarget.checked
        })
      }}
    />
  )
}
