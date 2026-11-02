'use client'

import Link from 'next/link'
import { ProgressBar } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/menus'
import { format } from '@/lib/i18n/dict'
import { useDict } from '@/lib/i18n/client'
import { dashboardDict } from '@/lib/i18n/dictionaries/dashboard'
import { percent } from '@/features/dashboard/format'
import type { SectionProgress } from '@/features/dashboard/server'

/** Per-section domain accuracy and lesson completion, with an R&W / Math switch. */
export function SectionTabs({ sections, defaultSection }: { sections: SectionProgress[]; defaultSection: string }) {
  const t = useDict(dashboardDict)
  if (sections.length === 0) return null
  return (
    <section className="rounded-lg border border-border bg-card">
      <Tabs defaultValue={defaultSection}>
        <div className="flex flex-col gap-3 px-5 pt-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-sans text-[15px] font-semibold text-foreground">{t.sections.title}</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{t.sections.description}</p>
          </div>
          <TabsList aria-label={t.sections.tabsLabel} className="max-w-full shrink-0 self-start border-b-0 sm:self-auto">
            {sections.map((s) => (
              <TabsTrigger key={s.code} value={s.code}>
                {t.sectionNames[s.code]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {sections.map((s) => (
          <TabsContent key={s.code} value={s.code} className="px-5 pb-5 pt-4">
            <div className="grid grid-cols-1 gap-3 border-b border-border pb-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">{t.stats.accuracy}</p>
                <p className="font-display text-2xl font-semibold text-foreground">{s.scored.answered > 0 ? percent(s.scored.accuracy) : '—'}</p>
                <p className="text-xs text-muted-foreground">
                  {s.scored.answered > 0 ? format(t.subjects.answered, { n: s.scored.answered }) : t.subjects.notPractised}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t.stats.lessons}</p>
                {s.lessons.total > 0 ? (
                  <>
                    <p className="font-display text-2xl font-semibold text-foreground">
                      {s.lessons.completed}
                      <span className="text-base font-normal text-muted-foreground">/{s.lessons.total}</span>
                    </p>
                    <ProgressBar
                      value={s.lessons.completed}
                      max={s.lessons.total}
                      size="sm"
                      className="mt-1.5 max-w-56"
                      label={format(t.subjects.lessonsLabel, { subject: t.sectionNames[s.code] })}
                    />
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">{t.subjects.noLessons}</p>
                )}
              </div>
            </div>
            <h3 className="sr-only">{t.subjects.domainHeading}</h3>
            <ul className="mt-4 space-y-4">
              {s.domains.map((d) => (
                <li key={d.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                    <span className="font-medium text-foreground">{d.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {d.scored.answered > 0 ? (
                        <>
                          <span className="font-semibold tabular text-foreground">{percent(d.scored.accuracy)}</span> ·{' '}
                          {format(t.subjects.answered, { n: d.scored.answered })}
                        </>
                      ) : (
                        t.subjects.notPractised
                      )}
                      {' · '}
                      {d.lessonsTotal > 0 ? format(t.sections.lessonsShort, { done: d.lessonsCompleted, total: d.lessonsTotal }) : t.sections.noLessonsShort}
                    </span>
                  </div>
                  {d.scored.answered > 0 && (
                    <ProgressBar
                      value={(d.scored.accuracy ?? 0) * 100}
                      size="sm"
                      className="mt-1.5"
                      label={format(t.subjects.accuracyLabel, { domain: d.name })}
                    />
                  )}
                </li>
              ))}
            </ul>
            <Link href={`/dashboard/courses/${s.slug}`} className="mt-4 inline-block text-[13px] font-medium text-primary hover:underline">
              {t.subjects.openCourse}
            </Link>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  )
}
