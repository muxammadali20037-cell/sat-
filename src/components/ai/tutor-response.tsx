'use client'

import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Lightbulb, Sparkles, Target } from 'lucide-react'
import { RichText } from '@/components/learning/rich-text'
import { Badge } from '@/components/ui/card'
import { useDict } from '@/lib/i18n/client'
import { format } from '@/lib/i18n/dict'
import { tutorDict } from '@/lib/i18n/dictionaries/tutor'
import { cn } from '@/lib/utils'
import type { TutorStructured } from '@/features/ai-tutor/schemas'

/**
 * Structured tutor answer: concept · feedback (identified mistake) · hint · numbered steps joined by
 * a vertical line · answer · next exercise. Every text part goes through RichText (safe + KaTeX).
 */
export function TutorResponseView({ structured, practiceHref }: { structured: TutorStructured; practiceHref?: string | null }) {
  const t = useDict(tutorDict)
  const { response: r, meta } = structured
  const steps = r.step_by_step_explanation

  return (
    <article className="min-w-0 space-y-4" aria-label={t.tutorName}>
      <header className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
        <span className="flex size-6 items-center justify-center rounded-md bg-navy-900 text-white dark:bg-primary">
          <Sparkles className="size-3.5" aria-hidden />
        </span>
        <span className="font-medium text-foreground">{t.tutorName}</span>
        <span aria-hidden>·</span>
        <span>
          {meta.mode === 'hint' && meta.hintLevel ? format(t.conversation.hintRequest, { level: meta.hintLevel }) : t.conversation.modes[meta.mode]}
        </span>
        {meta.provider === 'mock' && <Badge variant="warning">{t.mockLabel}</Badge>}
      </header>

      {r.concept && (
        <section>
          <h4 className="text-[13px] font-medium text-muted-foreground">{t.parts.concept}</h4>
          <RichText source={r.concept} className="reading mt-1 text-[15px] text-foreground" />
        </section>
      )}

      {r.identified_mistake && (
        <section role="note" className="rounded-lg border border-warning/30 bg-warning-soft p-3.5">
          <h4 className="flex items-center gap-1.5 text-[13px] font-semibold text-warning-foreground">
            <AlertTriangle className="size-4" aria-hidden /> {t.parts.feedback}
          </h4>
          <RichText source={r.identified_mistake} className="mt-1 text-[15px] text-foreground" />
        </section>
      )}

      {r.hint && (
        <section className="rounded-lg border border-primary/25 bg-primary-soft p-3.5">
          <h4 className="flex items-center gap-1.5 text-[13px] font-semibold text-primary">
            <Lightbulb className="size-4" aria-hidden /> {t.parts.hint}
          </h4>
          <RichText source={r.hint} className="mt-1 text-[15px] text-foreground" />
        </section>
      )}

      {steps.length > 0 && (
        <section>
          <h4 className="mb-2 text-[13px] font-medium text-muted-foreground">{t.parts.steps}</h4>
          <ol className="space-y-0">
            {steps.map((step, i) => (
              <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                {i < steps.length - 1 && <span aria-hidden className="absolute bottom-0 left-[13px] top-8 w-px bg-border-strong" />}
                <span
                  aria-hidden
                  className={cn(
                    'relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border text-[13px] font-semibold tabular',
                    i === 0 ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong bg-surface text-muted-foreground',
                  )}
                >
                  {i + 1}
                </span>
                <div className={cn('min-w-0 flex-1 rounded-lg px-3 py-2', i === 0 && 'bg-muted/60')}>
                  <p className="font-semibold text-foreground">
                    <span className="sr-only">{i + 1}. </span>
                    {step.title}
                  </p>
                  <RichText source={step.body} className="mt-1 text-[15px] leading-relaxed text-foreground" />
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {r.final_answer && (
        <section className="rounded-lg border border-success/30 bg-success-soft/60 p-3.5">
          <h4 className="flex items-center gap-1.5 text-[13px] font-semibold text-success">
            <CheckCircle2 className="size-4" aria-hidden /> {meta.mode === 'explain' ? t.parts.verifiedAnswer : t.parts.answer}
          </h4>
          <RichText source={r.final_answer} className="mt-1 text-[15px] font-medium text-foreground" />
        </section>
      )}

      {r.next_exercise && (
        <section className="flex items-start gap-2 text-sm">
          <Target className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <span className="font-medium text-foreground">{t.parts.next}: </span>
            <RichText as="span" source={r.next_exercise} className="text-muted-foreground" />
            {practiceHref && (
              <>
                {' '}
                <Link href={practiceHref} className="font-medium text-primary underline-offset-4 hover:underline">
                  {t.parts.practiceLink}
                </Link>
              </>
            )}
          </div>
        </section>
      )}
    </article>
  )
}
