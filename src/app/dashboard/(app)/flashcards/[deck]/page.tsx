import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Layers3 } from 'lucide-react'
import { requireStudentReady } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { getDict, getLocale } from '@/lib/i18n/server'
import { flashcardsDict } from '@/lib/i18n/dictionaries/flashcards'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/states'
import { FlashcardStudy } from '@/components/flashcards/study'
import { loadStudySession, newCardsLeftToday, SESSION_SIZE } from '@/features/flashcards/server'
import { MINE_DECK, myWordsSession } from '@/features/vocab/server'
import { vocabDict } from '@/lib/i18n/dictionaries/vocab'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict(flashcardsDict)
  return { title: t.metaTitle }
}

export default async function FlashcardDeckPage({ params }: { params: Promise<{ deck: string }> }) {
  const { deck: deckId } = await params
  if (!/^[a-z0-9-]{1,50}$/.test(deckId)) notFound()
  const profile = await requireStudentReady({ next: `/dashboard/flashcards/${deckId}` })
  const [t, locale, db] = await Promise.all([getDict(flashcardsDict), getLocale(), createServerSupabase()])
  const session =
    deckId === MINE_DECK
      ? await (async () => {
          const [v, newAllowance] = await Promise.all([getDict(vocabDict), newCardsLeftToday(db, profile)])
          const mine = await myWordsSession(db, profile, locale, { newAllowance, max: SESSION_SIZE })
          return { deck: { id: MINE_DECK, title: v.deckTitle }, cards: mine.cards, total: mine.total }
        })()
      : await loadStudySession(db, profile, deckId, locale)
  if (!session) notFound()

  const backLink = (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link href="/dashboard/flashcards">
        <ChevronLeft aria-hidden /> {t.back}
      </Link>
    </Button>
  )

  return (
    <>
      <PageHeader title={session.deck.title} breadcrumb={backLink} />
      {session.cards.length === 0 ? (
        <EmptyState icon={<Layers3 />} title={t.emptyTitle} description={t.emptyBody} />
      ) : (
        <FlashcardStudy cards={session.cards} />
      )}
    </>
  )
}
