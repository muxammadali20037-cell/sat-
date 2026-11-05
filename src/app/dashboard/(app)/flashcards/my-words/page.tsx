import type { Metadata } from 'next'
import Link from 'next/link'
import { BookA, ChevronLeft } from 'lucide-react'
import { requireStudentReady } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { getDict, getLocale } from '@/lib/i18n/server'
import { format, plural } from '@/lib/i18n/dict'
import { vocabDict } from '@/lib/i18n/dictionaries/vocab'
import { flashcardsDict } from '@/lib/i18n/dictionaries/flashcards'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { AddWordForm, MyWordsList } from '@/components/vocab/my-words'
import { loadMyWords } from '@/features/vocab/server'
import { dictionarySize } from '@/features/vocab/dictionary'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDict(vocabDict)).myWords }
}

export default async function MyWordsPage() {
  const profile = await requireStudentReady({ next: '/dashboard/flashcards/my-words' })
  const [t, f, locale, db] = await Promise.all([getDict(vocabDict), getDict(flashcardsDict), getLocale(), createServerSupabase()])
  const data = await loadMyWords(db, profile, locale)
  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link href="/dashboard/flashcards">
        <ChevronLeft aria-hidden /> {f.back}
      </Link>
    </Button>
  )
  const canStudy = data.due + data.newCount > 0
  return (
    <>
      <PageHeader title={t.myWords} description={t.myWordsDescription} breadcrumb={back} />
      <div className="space-y-6">
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-muted-foreground tabular">
            {plural(data.words.length, t.count)} · {format(f.stats.due, { n: data.due })} · {format(f.stats.learned, { n: data.learned })}
          </p>
          {canStudy ? (
            <Button asChild size="sm">
              <Link href="/dashboard/flashcards/mine">{data.due > 0 ? format(t.reviewDue, { n: data.due }) : t.review}</Link>
            </Button>
          ) : (
            <span className="text-[13px] text-muted-foreground">{t.nothingDue}</span>
          )}
        </Card>
        <section aria-labelledby="add-word" className="space-y-3">
          <h2 id="add-word" className="text-[15px] font-semibold">
            {t.addTitle}
          </h2>
          <AddWordForm />
        </section>
        {data.words.length === 0 ? <EmptyState icon={<BookA />} title={t.empty} description={t.emptyBody} /> : <MyWordsList words={data.words} />}
        <p className="text-xs text-muted-foreground">{format(t.dictionaryNote, { n: dictionarySize() })}</p>
      </div>
    </>
  )
}
