'use client'

import * as React from 'react'
import { PanelRightClose, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IconButton } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { CalculatorToggle, DesmosCalculator } from '@/components/learning/desmos-calculator'

export type CalculatorLabels = { toggle: string; show: string; hide: string; title: string; close: string }

const DESKTOP_QUERY = '(min-width: 1024px)'

function subscribe(onChange: () => void) {
  const media = window.matchMedia(DESKTOP_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

/** True at ≥ 1024px. Server render assumes desktop; the client snapshot takes over after hydration. */
export function useIsDesktop(): boolean {
  return React.useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP_QUERY).matches, () => true)
}

/**
 * Calculator visibility for a runner. `available` = the current question is Math.
 * Default: open beside the question on desktop, closed (button opens a full-screen sheet) on phones.
 * Once opened, the calculator stays mounted (hidden) so its graphs survive question changes.
 */
export function useCalculator(available: boolean) {
  const isDesktop = useIsDesktop()
  const [preference, setPreference] = React.useState<boolean | null>(null)
  const [mounted, setMounted] = React.useState(false)
  const open = available && (preference ?? isDesktop)
  return {
    available,
    isDesktop,
    open,
    mounted: mounted || open,
    setOpen: (value: boolean) => {
      setMounted(true)
      setPreference(value)
    },
  }
}
export type CalculatorState = ReturnType<typeof useCalculator>

/** Shared toolbar toggle (label hidden on phones to keep the top bar on one line). */
export function CalculatorToggleButton({ state, className }: { state: CalculatorState; className?: string }) {
  if (!state.available) return null
  return <CalculatorToggle pressed={state.open} onPressedChange={state.setOpen} showLabel={state.isDesktop} className={className} />
}

/** Right-hand panel (desktop). Render as the last column of the runner grid. */
export function CalculatorSidePanel({ state, labels, stateKey }: { state: CalculatorState; labels: CalculatorLabels; stateKey: string }) {
  if (!state.isDesktop || !state.mounted) return null
  const visible = state.open && state.available
  return (
    <aside
      aria-label={labels.title}
      hidden={!visible}
      className={cn('sticky top-20 flex h-[calc(100dvh-7rem)] min-h-[28rem] flex-col overflow-hidden rounded-xl border border-border bg-card', !visible && 'hidden')}
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3">
        <p className="text-sm font-medium">{labels.title}</p>
        <IconButton size="icon-sm" aria-label={labels.hide} icon={<PanelRightClose />} onClick={() => state.setOpen(false)} />
      </div>
      <DesmosCalculator stateKey={stateKey} className="min-h-0 flex-1 rounded-none border-0" />
    </aside>
  )
}

/** Full-screen sheet (phones and tablets). */
export function CalculatorSheet({ state, labels, stateKey }: { state: CalculatorState; labels: CalculatorLabels; stateKey: string }) {
  if (state.isDesktop) return null
  return (
    <Dialog open={state.open} onOpenChange={state.setOpen}>
      <DialogContent
        hideClose
        aria-describedby={undefined}
        className="left-0 top-0 flex h-dvh max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <DialogTitle className="text-base">{labels.title}</DialogTitle>
          <IconButton aria-label={labels.close} icon={<X />} onClick={() => state.setOpen(false)} />
        </div>
        <DesmosCalculator stateKey={stateKey} className="min-h-0 flex-1 rounded-none border-0" />
      </DialogContent>
    </Dialog>
  )
}
