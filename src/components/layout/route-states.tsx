'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { ErrorState, Skeleton } from '@/components/ui/states'

/** Skeleton shown while an app page streams in (matches PageHeader + content rhythm). */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="mt-6 h-64" />
    </div>
  )
}

/** Error boundary body for app segments. Logs the digest; never shows internals. */
export function SegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[segment-error]', error.digest ?? error.message)
  }, [error])
  return (
    <ErrorState
      title="This page could not load"
      description={`Try again in a moment.${error.digest ? ` Reference: ${error.digest}` : ''}`}
      action={
        <Button variant="secondary" onClick={reset}>
          Try again
        </Button>
      }
    />
  )
}
