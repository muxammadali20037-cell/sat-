import { Sparkles, User } from 'lucide-react'
import { Badge } from '@/components/ui/card'
import { RichText } from '@/components/learning/rich-text'
import type { PublicDict } from '@/lib/i18n/dictionaries/public'

/** Static, clearly labelled example of the tutor's structured response (not a live model call). */
export function TutorExample({ t, exampleLabel }: { t: PublicDict['tutor']; exampleLabel: string }) {
  return (
    <figure className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sparkles className="size-4 text-primary" aria-hidden />
          {t.tutorLabel}
        </span>
        <Badge variant="outline">{exampleLabel}</Badge>
      </div>
      <div className="grid grid-cols-1 gap-5 p-4 sm:p-5">
        <div className="flex items-start justify-end gap-3">
          <p className="max-w-[85%] rounded-lg bg-primary px-3.5 py-2.5 text-sm text-primary-foreground">
            <span className="sr-only">{t.studentLabel}: </span>
            {t.question}
          </p>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
            <User className="size-4" />
          </span>
        </div>

        <dl className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-background p-4 text-sm">
          <div>
            <dt className="font-semibold text-foreground">{t.concept}</dt>
            <dd className="mt-1 text-muted-foreground">{t.conceptBody}</dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">{t.mistake}</dt>
            <dd className="mt-1 text-muted-foreground">
              <RichText as="span" source={t.mistakeBody} />
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">{t.hint}</dt>
            <dd className="mt-1 text-muted-foreground">
              <RichText as="span" source={t.hintBody} />
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">{t.steps}</dt>
            <dd className="mt-1">
              <ol className="grid grid-cols-1 gap-1.5 text-foreground">
                {t.stepList.map((step, i) => (
                  <li key={step} className="flex gap-2.5">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground tabular">
                      {i + 1}
                    </span>
                    <RichText as="span" source={step} />
                  </li>
                ))}
              </ol>
            </dd>
          </div>
          <div className="border-t border-border pt-4">
            <dt className="font-semibold text-foreground">{t.next}</dt>
            <dd className="mt-1 text-primary">{t.nextBody}</dd>
          </div>
        </dl>
      </div>
      <figcaption className="border-t border-border px-4 py-3 text-xs leading-relaxed text-muted-foreground sm:px-5">{t.note}</figcaption>
    </figure>
  )
}
