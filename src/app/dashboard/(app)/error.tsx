'use client'

import { SegmentError } from '@/components/layout/route-states'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError error={error} reset={reset} />
}
