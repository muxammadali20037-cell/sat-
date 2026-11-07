'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PackageOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { importBundledQuestionPackAction, publishBundledQuestionPackAction } from '@/features/content/import-actions'

/**
 * The original question pack shipped with the app. Importing creates drafts only: they still go
 * through the review queue and publishing like any other question.
 */
export function ImportQuestionPack({ id, total, skills, imported, published }: { id: string; total: number; skills: number; imported: number; published: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [failures, setFailures] = useState<Array<{ row: number; error: string }>>([])
  const remaining = total - imported
  const unpublished = total - published
  const [publishing, startPublish] = useTransition()
  const reviewHref = `/admin/questions?view=review&tag=${encodeURIComponent(id)}`

  return (
    <section aria-labelledby={`pack-heading-${id}`} className="mb-6 rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id={`pack-heading-${id}`} className="flex items-center gap-2 text-base font-semibold">
            <PackageOpen className="size-5 shrink-0 text-primary" aria-hidden />
            {id === 'core-v1' ? 'Starter question pack' : `Question pack ${id}`}
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            {total} original practice questions written for this platform across {skills} Digital SAT skill{skills === 1 ? '' : 's'}, with English and
            Uzbek explanations. They are imported as drafts with the tag <span className="font-medium text-foreground">{id}</span>, so a reviewer
            checks each one before students can see it.
          </p>
          <p className="mt-2 text-sm">
            {published >= total ? (
              <>All {total} questions are published. </>
            ) : remaining === 0 ? (
              <>All {total} questions are in this environment ({published} published). </>
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
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
        {unpublished > 0 && (
          <Button
            className="shrink-0"
            loading={publishing}
            disabled={pending}
            data-testid={`publish-pack-${id}`}
            onClick={() =>
              startPublish(async () => {
                const res = await publishBundledQuestionPackAction(id)
                if (!res.ok) {
                  toast.error(res.error)
                  return
                }
                if (res.data && res.data.skipped > 0) toast.warning(res.message ?? 'Published')
                else toast.success(res.message ?? 'Published')
                router.refresh()
              })
            }
          >
            Import and publish all {total}
          </Button>
        )}
        {remaining > 0 && (
          <Button
            variant="secondary"
            disabled={publishing}
            className="shrink-0"
            loading={pending}
            onClick={() =>
              start(async () => {
                const res = await importBundledQuestionPackAction(id)
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
        {unpublished > 0 && (
          <p className="max-w-xs text-xs text-muted-foreground sm:text-right">
            Every bundled pack was solved by independent checkers before release (see QUESTION_PACKS.md). Publishing is your sign-off.
          </p>
        )}
        </div>
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
