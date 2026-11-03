import type { Metadata } from 'next'
import Link from 'next/link'
import { requireStudentReady } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { getDict, getLocale } from '@/lib/i18n/server'
import { format, plural } from '@/lib/i18n/dict'
import { flashcardsDict } from '@/lib/i18n/dictionaries/flashcards'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress'
import { loadDeckSummaries, NEW_CARDS_PER_DAY } from '@/features/flashcards/server'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict(flashcardsDict)
  return { title: t.metaTitle }
}

export default async function FlashcardsPage() {
  const profile = await requireStudentReady({ next: '/dashboard/flashcards' })
  const [t, locale, db] = await Promise.all([getDict(flashcardsDict), getLocale(), createServerSupabase()])
  const { decks, newLeftToday } = await loadDeckSummaries(db, profile, locale)

  return (
    <>
      <PageHeader title={t.title} description={t.description} />
      <p className="-mt-3 mb-5 text-[13px] text-muted-foreground tabular">{format(t.newLeft, { n: newLeftToday, total: NEW_CARDS_PER_DAY })}</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {decks.map((d) => {
          const available = d.due + Math.min(d.newCount, newLeftToday)
          return (
            <Card key={d.id} className="flex flex-col gap-4 p-5">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {t.subjects[d.subject]} · {plural(d.total, t.cards)}
                </p>
                <h2 className="mt-1 text-[17px] font-semibold text-foreground">{d.title}</h2>
                <p className="mt-1 text-[13px] text-muted-foreground">{d.description}</p>
              </div>
              <div className="space-y-1.5">
                <ProgressBar value={d.learned} max={d.total} label={format(t.stats.learned, { n: d.learned })} size="sm" tone="success" />
                <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular">
                  <span className={d.due > 0 ? 'font-medium text-foreground' : undefined}>{format(t.stats.due, { n: d.due })}</span>
                  <span>{format(t.stats.new, { n: d.newCount })}</span>
                  <span>{format(t.stats.learned, { n: d.learned })}</span>
                </p>
              </div>
              <div className="mt-auto">
                {available > 0 ? (
                  <Button asChild size="sm">
                    <Link href={`/dashboard/flashcards/${d.id}`}>{d.due > 0 ? format(t.studyDue, { n: d.due }) : t.study}</Link>
                  </Button>
                ) : (
                  <p className="text-[13px] text-muted-foreground">{t.nothingDue}</p>
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </>
  )
}
