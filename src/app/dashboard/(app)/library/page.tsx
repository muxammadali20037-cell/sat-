import type { Metadata } from 'next'
import { requireStudentReady } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { getDict } from '@/lib/i18n/server'
import { resourcesDict } from '@/lib/i18n/dictionaries/resources'
import { PageHeader } from '@/components/layout/page-header'
import { LibraryShelves } from '@/components/resources/library-shelves'
import { loadLibrary } from '@/features/resources/server'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDict(resourcesDict)).library.metaTitle }
}

export default async function LibraryPage() {
  await requireStudentReady({ next: '/dashboard/library' })
  const [t, db] = await Promise.all([getDict(resourcesDict), createServerSupabase()])
  const items = await loadLibrary(db)
  return (
    <>
      <PageHeader title={t.library.title} description={t.library.description} />
      <LibraryShelves items={items} labels={t.library} />
      <p className="mt-8 max-w-3xl text-xs text-muted-foreground">{t.notice}</p>
    </>
  )
}
