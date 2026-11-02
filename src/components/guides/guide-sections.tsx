import { AlertTriangle, CheckSquare, Clock, Info, Lightbulb, Search, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from '@/lib/i18n/dict'
import { RichText } from '@/components/learning/rich-text'
import type { GuideSection } from '@/features/guides/schema'
import type { GuidesDict } from '@/lib/i18n/dictionaries/guides'

export const sectionAnchor = (index: number) => `section-${index + 1}`

const LABELS = ['A', 'B', 'C', 'D'] as const

function Heading({ section, index, t }: { section: GuideSection; index: number; t: GuidesDict }) {
  return (
    <header className="mb-3">
      <p className="text-xs font-medium text-muted-foreground">{t.sectionLabels[section.type]}</p>
      <h2 id={sectionAnchor(index)} className="scroll-mt-24 text-[19px] font-semibold leading-snug text-foreground">
        {section.heading}
      </h2>
    </header>
  )
}

function IconList({ items, icon: Icon, iconClass }: { items: string[]; icon: typeof Search; iconClass: string }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <Icon className={cn('mt-1 size-4 shrink-0', iconClass)} aria-hidden />
          <RichText source={item} className="reading min-w-0 flex-1 text-[15px] text-foreground" />
        </li>
      ))}
    </ul>
  )
}

function Steps({ steps, t }: { steps: string[]; t: GuidesDict }) {
  return (
    <ol className="relative space-y-4">
      {steps.map((step, i) => (
        <li key={i} className="relative flex gap-4">
          {i < steps.length - 1 && <span className="absolute left-[13px] top-8 h-[calc(100%-1rem)] w-px bg-border" aria-hidden />}
          <span
            className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-primary-foreground tabular"
            aria-label={format(t.step, { n: i + 1 })}
          >
            {i + 1}
          </span>
          <RichText source={step} className="reading min-w-0 flex-1 pt-0.5 text-[15px] text-foreground" />
        </li>
      ))}
    </ol>
  )
}

function Example({ example, t }: { example: NonNullable<GuideSection['example']>; t: GuidesDict }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="space-y-4 p-4 sm:p-5">
        {example.passage && (
          <div className="rounded-md bg-muted/60 p-4">
            <RichText source={example.passage} className="reading text-[15px] text-foreground" />
          </div>
        )}
        <RichText source={example.problem} className="reading text-[15px] font-medium text-foreground" />
        {example.choices && (
          <ol className="grid grid-cols-1 gap-2" aria-label={t.choices}>
            {example.choices.map((c, i) => (
              <li key={i} className="flex items-start gap-3 rounded-md border border-border px-3 py-2.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border-strong text-xs font-semibold text-muted-foreground">
                  {LABELS[i]}
                </span>
                <RichText source={c} as="span" className="min-w-0 flex-1 pt-px text-[15px] text-foreground" />
              </li>
            ))}
          </ol>
        )}
      </div>
      {/* Solution stays folded so the student can try first. */}
      <details className="group border-t border-border">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-primary hover:bg-muted/50 sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">{t.solution} ▸</span>
          <span className="hidden group-open:inline">{t.solution} ▾</span>
        </summary>
        <div className="space-y-4 px-4 pb-5 sm:px-5">
          <Steps steps={example.solution} t={t} />
          <p className="flex flex-wrap items-baseline gap-2 rounded-md bg-success-soft px-3 py-2 text-[15px]">
            <span className="font-semibold text-success">{t.answer}:</span>
            <RichText source={example.answer} as="span" className="font-semibold text-foreground" />
          </p>
        </div>
      </details>
    </div>
  )
}

function Terms({ terms, t }: { terms: NonNullable<GuideSection['terms']>; t: GuidesDict }) {
  return (
    <dl className="divide-y divide-border rounded-lg border border-border bg-card">
      <div className="hidden grid-cols-[minmax(0,13rem)_minmax(0,1fr)] gap-4 px-4 py-2 text-xs font-medium text-muted-foreground sm:grid">
        <dt>{t.term}</dt>
        <dd>{t.meaning}</dd>
      </div>
      {terms.map((term, i) => (
        <div key={i} className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:gap-4">
          <dt className="text-[15px] font-semibold text-foreground" lang="en">
            {term.term}
          </dt>
          <dd>
            <RichText source={term.meaning} className="text-[15px] text-muted-foreground" />
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Panel({ tone, children }: { tone: 'warning' | 'danger' | 'info' | 'plain'; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-lg p-4 sm:p-5',
        tone === 'warning' && 'border border-warning/30 bg-warning-soft/60',
        tone === 'danger' && 'border border-destructive/25 bg-destructive-soft/50',
        tone === 'info' && 'border border-primary/20 bg-primary-soft/50',
        tone === 'plain' && 'border border-border bg-card',
      )}
    >
      {children}
    </div>
  )
}

function SectionBody({ section, t }: { section: GuideSection; t: GuidesDict }) {
  const body = section.body ? <RichText source={section.body} className="reading text-[15px] text-foreground" /> : null
  switch (section.type) {
    case 'method':
      return (
        <div className="space-y-4">
          {body}
          {section.steps && <Steps steps={section.steps} t={t} />}
        </div>
      )
    case 'example':
      return (
        <div className="space-y-4">
          {body}
          {section.example && <Example example={section.example} t={t} />}
        </div>
      )
    case 'terms':
      return (
        <div className="space-y-4">
          {body}
          {section.terms && <Terms terms={section.terms} t={t} />}
        </div>
      )
    case 'watch_out':
      return (
        <Panel tone="warning">
          <div className="space-y-3">
            {body}
            {section.items && <IconList items={section.items} icon={AlertTriangle} iconClass="text-warning" />}
          </div>
        </Panel>
      )
    case 'traps':
      return (
        <Panel tone="danger">
          <div className="space-y-3">
            {body}
            {section.items && <IconList items={section.items} icon={XCircle} iconClass="text-destructive" />}
          </div>
        </Panel>
      )
    case 'note':
      return (
        <Panel tone="info">
          <div className="space-y-3">
            {body}
            {section.items && <IconList items={section.items} icon={Info} iconClass="text-primary" />}
            {section.steps && <Steps steps={section.steps} t={t} />}
          </div>
        </Panel>
      )
    default: {
      const icon = section.type === 'recognize' ? Search : section.type === 'time' ? Clock : section.type === 'checklist' ? CheckSquare : Lightbulb
      return (
        <div className="space-y-4">
          {body}
          {section.items && <IconList items={section.items} icon={icon} iconClass="text-primary" />}
          {section.steps && <Steps steps={section.steps} t={t} />}
        </div>
      )
    }
  }
}

export function GuideSections({ sections, t }: { sections: GuideSection[]; t: GuidesDict }) {
  return (
    <div className="space-y-10">
      {sections.map((section, i) => (
        <section key={i} aria-labelledby={sectionAnchor(i)}>
          <Heading section={section} index={i} t={t} />
          <SectionBody section={section} t={t} />
        </section>
      ))}
    </div>
  )
}
