'use client'

import Link from 'next/link'
import { BookMarked, Calculator, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DesmosCalculator } from '@/components/learning/desmos-calculator'

export type DashboardToolsLabels = {
  calculator: string
  calculatorTitle: string
  calculatorNote: string
  tutor: string
  guides: string
}

/**
 * Quick tools in the dashboard header: the Desmos graphing calculator (in a large dialog,
 * full screen on phones), the AI tutor and the study guides. Without a Desmos key the
 * calculator component shows its honest "open desmos.com" fallback.
 */
export function DashboardTools({ labels }: { labels: DashboardToolsLabels }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="secondary" size="sm">
            <Calculator aria-hidden />
            {labels.calculator}
          </Button>
        </DialogTrigger>
        <DialogContent className="flex h-[min(46rem,calc(100dvh-2rem))] max-w-4xl flex-col gap-3 p-4 max-sm:left-0 max-sm:top-[var(--app-inset-top)] max-sm:h-dvh max-sm:max-h-none max-sm:w-screen max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0">
          <div className="pr-8">
            <DialogTitle className="text-base">{labels.calculatorTitle}</DialogTitle>
            <DialogDescription className="text-[13px]">{labels.calculatorNote}</DialogDescription>
          </div>
          <DesmosCalculator stateKey="dashboard" className="min-h-0 flex-1" />
        </DialogContent>
      </Dialog>
      <Button asChild variant="secondary" size="sm">
        <Link href="/dashboard/ai-tutor">
          <Sparkles aria-hidden />
          {labels.tutor}
        </Link>
      </Button>
      <Button asChild variant="ghost" size="sm" className="max-sm:hidden">
        <Link href="/dashboard/guides">
          <BookMarked aria-hidden />
          {labels.guides}
        </Link>
      </Button>
    </div>
  )
}
