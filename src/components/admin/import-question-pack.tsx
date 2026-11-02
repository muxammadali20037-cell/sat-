'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PackageOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { importBundledQuestionPackAction } from '@/features/content/import-actions'

/**
 * The original question pack shipped with the app. Importing creates drafts only: they still go
 * through the review queue and publishing like any other question.
 */
export function ImportQuestionPack({ id, total, skills, imported }: { id: string; total: number; skills: number; imported: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [failures, setFailures] = useState<Array<{ row: number; error: string }>>([])
  const remaining = total - imported
  const reviewHref = `/admin/questions?view=review&tag=${encodeURIComponent(id)}`

  return (
    <section aria-labelledby="pack-heading" className="mb-6 rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="pack-heading" className="flex items-center gap-2 text-base font-semibold">
            <PackageOpen className="size-5 shrink-0 text-primary" aria-hidden />
            Starter question pack
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            {total} original practice questions written for this platform across {skills} Digital SAT skill{skills === 1 ? '' : 's'}, with English and
            Uzbek explanations. They are imported as drafts with the tag <span className="font-medium text-foreground">{id}</span>, so a reviewer
            checks each one before students can see it.
          </p>
          <p className="mt-2 text-sm">
            {remaining === 0 ? (
              <>All {total} questions are in this environment. </>
            ) : imported > 0 ? (
              <>
                {imported} of {total} already imported.{' '}
              </>
            ) : null}
            {imported > 0 && (
              <Link href={reviewHref} className="font-medium text-primary hover:underline">
                Review imported drafts
              </Link>
            )}
          </p>
        </div>
        {remaining > 0 && (
          <Button
            className="shrink-0"
            loading={pending}
            onClick={() =>
              start(async () => {
                const res = await importBundledQuestionPackAction()
                if (!res.ok) {
                  toast.error(res.error)
                  return
                }
                setFailures(res.data?.failed ?? [])
                toast.success(res.message ?? 'Imported')
                router.refresh()
              })
            }
          >
            Import {remaining} question{remaining === 1 ? '' : 's'} as drafts
          </Button>
        )}
      </div>
      {failures.length > 0 && (
        <div role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive-soft/60 p-3 text-sm">
          <p className="font-medium">{failures.length} question(s) could not be saved:</p>
          <ul className="mt-1 list-disc pl-5">
            {failures.slice(0, 10).map((f) => (
              <li key={f.row}>
                Row {f.row}: {f.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
