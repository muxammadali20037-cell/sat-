'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from '@/components/ui/toast'
import { useDict } from '@/lib/i18n/client'
import { defineDict } from '@/lib/i18n/dict'

/**
 * One-shot confirmation after a redirect (`?toast=<key>`). Only known keys are shown — the
 * query string never becomes UI text — and the parameter is removed afterwards.
 */
const dict = defineDict({
  en: { password_updated: 'Your password has been updated.' },
  uz: { password_updated: 'Parolingiz yangilandi.' },
})

export function FlashToast() {
  const t = useDict(dict)
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const key = params.get('toast')

  React.useEffect(() => {
    if (!key) return
    if (key in t) toast.success(t[key as keyof typeof t])
    const next = new URLSearchParams(params.toString())
    next.delete('toast')
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [key, params, pathname, router, t])

  return null
}
