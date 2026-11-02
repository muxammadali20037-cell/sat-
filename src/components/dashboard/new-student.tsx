import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { dashboardDict } from '@/lib/i18n/dictionaries/dashboard'

type T = (typeof dashboardDict)['en']

/** Guided first-run state: one primary action (the free diagnostic), the learning loop, nothing fake. */
export function NewStudentPanel({ t, howToGuide }: { t: T; howToGuide?: { href: string; label: string } }) {
  const steps = [t.newStudent.steps.diagnose, t.newStudent.steps.learn, t.newStudent.steps.practice, t.newStudent.steps.measure]
  return (
    <section aria-labelledby="first-steps-title" className="rounded-xl border border-border bg-card p-6 sm:p-8">
      <h2 id="first-steps-title" className="text-[22px] font-semibold text-foreground">
        {t.newStudent.title}
      </h2>
      <p className="mt-2 max-w-[60ch] text-[15px] text-muted-foreground">{t.newStudent.body}</p>
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Button asChild size="lg">
          <Link href="/dashboard/diagnostic">{t.newStudent.cta}</Link>
        </Button>
        <Link href="/dashboard/courses" className="text-sm font-medium text-primary hover:underline">
          {t.newStudent.browse}
        </Link>
        {howToGuide && (
          <Link href={howToGuide.href} className="text-sm font-medium text-primary hover:underline">
            {howToGuide.label}
          </Link>
        )}
      </div>
      <h3 className="mt-8 font-sans text-[13px] font-semibold text-muted-foreground">{t.newStudent.loopTitle}</h3>
      <ol className="mt-3 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, i) => (
          <li key={step.title} className="bg-card p-4">
            <span className="flex size-6 items-center justify-center rounded-md border border-border-strong text-xs font-semibold tabular text-foreground" aria-hidden>
              {i + 1}
            </span>
            <p className="mt-2 text-sm font-medium text-foreground">{step.title}</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
