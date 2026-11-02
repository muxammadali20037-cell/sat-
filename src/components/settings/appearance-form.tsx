'use client'

import * as React from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDict } from '@/lib/i18n/client'
import { settingsDict } from '@/lib/i18n/dictionaries/settings'

/** Theme stored in localStorage 'sm_theme'; the root layout applies it before paint on load. */
type Theme = 'light' | 'dark' | 'system'
const STORAGE_KEY = 'sm_theme'
const EVENT = 'sm-theme-change'

function readTheme(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'light'
  } catch {
    return 'light'
  }
}

function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

function subscribe(callback: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const onSystemChange = () => {
    if (readTheme() === 'system') applyTheme('system')
    callback()
  }
  window.addEventListener('storage', callback)
  window.addEventListener(EVENT, callback)
  media.addEventListener('change', onSystemChange)
  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener(EVENT, callback)
    media.removeEventListener('change', onSystemChange)
  }
}

export function AppearanceForm() {
  const t = useDict(settingsDict)
  const theme = React.useSyncExternalStore(subscribe, readTheme, () => 'light' as Theme)

  const choose = (next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // storage unavailable (private mode): still apply for this page view
    }
    applyTheme(next)
    window.dispatchEvent(new Event(EVENT))
  }

  const options: Array<{ value: Theme; label: string; icon: React.ReactNode; hint?: string }> = [
    { value: 'light', label: t.appearance.light, icon: <Sun aria-hidden /> },
    { value: 'dark', label: t.appearance.dark, icon: <Moon aria-hidden /> },
    { value: 'system', label: t.appearance.system, icon: <Monitor aria-hidden />, hint: t.appearance.systemHint },
  ]

  return (
    <fieldset>
      <legend className="sr-only">{t.appearance.title}</legend>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {options.map((option) => {
          const checked = theme === option.value
          return (
            <label
              key={option.value}
              className={cn(
                'flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border bg-surface px-4 py-3 transition-colors duration-150 [&_svg]:size-4',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
                checked ? 'border-primary bg-primary-soft' : 'border-border hover:border-border-strong',
              )}
            >
              <input type="radio" name="sm-theme" value={option.value} checked={checked} onChange={() => choose(option.value)} className="sr-only" />
              <span className={checked ? 'text-primary' : 'text-muted-foreground'}>{option.icon}</span>
              <span>
                <span className="block text-sm font-medium text-foreground">{option.label}</span>
                {option.hint && <span className="block text-xs text-muted-foreground">{option.hint}</span>}
              </span>
            </label>
          )
        })}
      </div>
      <p className="mt-3 text-[13px] text-muted-foreground">{t.appearance.deviceNote}</p>
    </fieldset>
  )
}
