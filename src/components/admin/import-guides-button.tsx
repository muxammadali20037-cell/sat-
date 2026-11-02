'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { importBundledGuidesAction } from '@/features/guides/admin-actions'

/** Loads the guides shipped with the app into this environment (missing ones only). */
export function ImportGuidesButton({ missing }: { missing: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Button
      variant="secondary"
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await importBundledGuidesAction()
          if (res.ok) {
            toast.success(res.message ?? 'Imported')
            router.refresh()
          } else toast.error(res.error)
        })
      }
    >
      <Download aria-hidden /> Import {missing} bundled guide{missing === 1 ? '' : 's'}
    </Button>
  )
}
