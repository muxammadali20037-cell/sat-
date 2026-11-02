'use client'

import * as React from 'react'
import { Calculator, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isDesmosConfigured, publicEnv } from '@/lib/env'
import { defineDict } from '@/lib/i18n/dict'
import { useDict } from '@/lib/i18n/client'

/**
 * Desmos graphing calculator — the same tool the Digital SAT provides for the whole Math section.
 *
 * - Loads the Desmos API script once per page (shared promise) and creates one calculator per mount.
 * - `stateKey` keeps the student's expressions when the panel is closed and reopened (in-memory only:
 *   cleared on reload, never sent to the server).
 * - Without NEXT_PUBLIC_DESMOS_API_KEY it renders an honest fallback that opens desmos.com in a new tab.
 *
 * Layout belongs to the caller: the component fills its container (give it a height via `className`).
 */

type DesmosCalculatorInstance = {
  getState: () => unknown
  setState: (state: unknown) => void
  resize: () => void
  destroy: () => void
}

type DesmosApi = {
  GraphingCalculator: (element: HTMLElement, options?: Record<string, unknown>) => DesmosCalculatorInstance
}

declare global {
  interface Window {
    Desmos?: DesmosApi
  }
}

const dict = defineDict({
  en: {
    title: 'Graphing calculator',
    loading: 'Loading calculator…',
    notConfigured: 'The built-in calculator isn’t set up on this site yet.',
    failed: 'The calculator couldn’t load. Check your connection and try again.',
    openDesmos: 'Open Desmos in a new tab',
    show: 'Show calculator',
    hide: 'Hide calculator',
  },
  uz: {
    title: 'Grafik kalkulyator',
    loading: 'Kalkulyator yuklanmoqda…',
    notConfigured: 'Ichki kalkulyator hali sozlanmagan.',
    failed: 'Kalkulyator yuklanmadi. Internetni tekshirib, qayta urinib ko‘ring.',
    openDesmos: 'Desmos’ni yangi oynada ochish',
    show: 'Kalkulyatorni ko‘rsatish',
    hide: 'Kalkulyatorni yashirish',
  },
})

let scriptPromise: Promise<DesmosApi> | null = null

function loadDesmos(): Promise<DesmosApi> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Desmos can only load in the browser'))
  if (window.Desmos) return Promise.resolve(window.Desmos)
  if (scriptPromise) return scriptPromise
  const key = publicEnv.NEXT_PUBLIC_DESMOS_API_KEY
  if (!key) return Promise.reject(new Error('NEXT_PUBLIC_DESMOS_API_KEY is not set'))

  scriptPromise = new Promise<DesmosApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://www.desmos.com/api/${publicEnv.NEXT_PUBLIC_DESMOS_API_VERSION}/calculator.js?apiKey=${encodeURIComponent(key)}`
    script.async = true
    script.onload = () => (window.Desmos ? resolve(window.Desmos) : reject(new Error('Desmos did not initialise')))
    script.onerror = () => {
      scriptPromise = null // allow a retry on the next mount
      script.remove()
      reject(new Error('Failed to load the Desmos script'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

/** Calculator state per `stateKey`, kept for the lifetime of the tab only. */
const savedStates = new Map<string, unknown>()

/** Exam-like configuration: no graph links, images, folders or notes. */
const CALCULATOR_OPTIONS = {
  keypad: true,
  expressions: true,
  settingsMenu: true,
  zoomButtons: true,
  border: false,
  autosize: true,
  images: false,
  folders: false,
  notes: false,
  links: false,
} as const

export function DesmosCalculator({ stateKey, className }: { stateKey?: string; className?: string }) {
  const t = useDict(dict)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'error'>(isDesmosConfigured ? 'loading' : 'error')

  React.useEffect(() => {
    if (!isDesmosConfigured) return
    let calculator: DesmosCalculatorInstance | null = null
    let cancelled = false

    loadDesmos()
      .then((Desmos) => {
        if (cancelled || !containerRef.current) return
        calculator = Desmos.GraphingCalculator(containerRef.current, CALCULATOR_OPTIONS)
        const saved = stateKey ? savedStates.get(stateKey) : undefined
        if (saved) calculator.setState(saved)
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        console.warn('[desmos]', error)
        setStatus('error')
      })

    return () => {
      cancelled = true
      if (calculator) {
        if (stateKey) savedStates.set(stateKey, calculator.getState())
        calculator.destroy()
      }
    }
  }, [stateKey])

  if (!isDesmosConfigured || status === 'error') {
    return (
      <div
        className={cn(
          'flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-muted/40 p-6 text-center',
          className,
        )}
      >
        <Calculator className="size-6 text-muted-foreground" aria-hidden />
        <p className="max-w-64 text-sm text-muted-foreground">{isDesmosConfigured ? t.failed : t.notConfigured}</p>
        <a
          href="https://www.desmos.com/calculator"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          {t.openDesmos}
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>
    )
  }

  return (
    <div className={cn('relative min-h-48 overflow-hidden rounded-lg border border-border bg-white', className)}>
      <div ref={containerRef} className="absolute inset-0" aria-label={t.title} role="application" />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">{t.loading}</div>
      )}
    </div>
  )
}

/** Toolbar button that shows/hides the calculator panel. */
export function CalculatorToggle({
  pressed,
  onPressedChange,
  className,
  showLabel = true,
}: {
  pressed: boolean
  onPressedChange: (next: boolean) => void
  className?: string
  showLabel?: boolean
}) {
  const t = useDict(dict)
  const label = pressed ? t.hide : t.show
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={showLabel ? undefined : label}
      title={label}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors',
        pressed ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-surface text-foreground hover:bg-muted',
        className,
      )}
    >
      <Calculator className="size-4" aria-hidden />
      {showLabel && <span>{t.title}</span>}
    </button>
  )
}
