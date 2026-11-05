'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { importBundledCoursesAction } from '@/features/courses/bundle-actions'

/** Loads the courses and text lessons shipped with the app (missing ones only). */
export function ImportCoursesButton({ missing }: { missing: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Button
      variant="secondary"
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await importBundledCoursesAction()
          if (res.ok) {
            toast.success(res.message ?? 'Imported')
            router.refresh()
          } else toast.error(res.error)
        })
      }
    >
      <Download aria-hidden /> Import {missing} bundled lesson{missing === 1 ? '' : 's'}
    </Button>
  )
}
