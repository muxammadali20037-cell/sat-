'use client'

import { useTransition } from 'react'
import { Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLocale } from '@/lib/i18n/client'
import { LOCALES, LOCALE_NAMES } from '@/lib/i18n/config'
import { setLocaleAction } from '@/lib/i18n/actions'

export function LocaleSwitcher({ className, label = 'Language' }: { className?: string; label?: string }) {
  const locale = useLocale()
  const [pending, startTransition] = useTransition()
  return (
    <label className={cn('relative inline-flex items-center gap-1.5 text-[13px] text-muted-foreground', className)}>
      <Globe className="size-4" aria-hidden />
      <span className="sr-only">{label}</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => startTransition(() => setLocaleAction(e.target.value))}
        className="cursor-pointer appearance-none bg-transparent pr-1 font-medium text-foreground focus-visible:outline-none"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  )
}
