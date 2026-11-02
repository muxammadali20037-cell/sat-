import type { Metadata } from 'next'
import Link from 'next/link'
import { FaqList } from '@/components/marketing/faq-list'
import { getDict } from '@/lib/i18n/server'
import { publicDict } from '@/lib/i18n/dictionaries/public'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict(publicDict, { public: true })
  return { title: t.meta.faqTitle, description: t.meta.faqDescription }
}

export default async function FaqPage() {
  const t = await getDict(publicDict, { public: true })
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
        <header>
          <h1 className="text-[32px] font-semibold leading-tight text-foreground sm:text-[40px]">{t.faq.title}</h1>
          <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground">{t.faq.description}</p>
          <p className="mt-6 text-sm text-muted-foreground">
            {t.faq.stillQuestions}{' '}
            <Link href="/contact" className="font-medium text-primary underline-offset-4 hover:underline">
              {t.faq.contact}
            </Link>
          </p>
        </header>
        <FaqList items={t.faq.items} />
      </div>
    </div>
  )
}
