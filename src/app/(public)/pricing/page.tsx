import type { Metadata } from 'next'
import Link from 'next/link'
import { FaqList } from '@/components/marketing/faq-list'
import { FeatureTable, PlanCards } from '@/components/marketing/pricing'
import { loadPublicPlans } from '@/components/marketing/load-plans'
import { getDict, getPublicLocale } from '@/lib/i18n/server'
import { publicDict } from '@/lib/i18n/dictionaries/public'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict(publicDict, { public: true })
  return { title: t.meta.pricingTitle, description: t.meta.pricingDescription }
}

export default async function PricingPage() {
  const [t, locale, plans] = await Promise.all([getDict(publicDict, { public: true }), getPublicLocale(), loadPublicPlans()])
  const p = t.pricing
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <header className="max-w-3xl">
        <h1 className="text-[32px] font-semibold leading-tight text-foreground sm:text-[44px]">{p.title}</h1>
        <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground">{p.description}</p>
      </header>

      <div className="mt-10">
        <PlanCards plans={plans} t={p} locale={locale} />
        <p className="mt-6 max-w-3xl text-sm text-muted-foreground">{p.billingNote}</p>
      </div>

      <section aria-labelledby="compare-title" className="mt-20">
        <h2 id="compare-title" className="text-[24px] font-semibold text-foreground sm:text-[28px]">
          {p.tableTitle}
        </h2>
        <div className="mt-6">
          <FeatureTable plans={plans} t={p} locale={locale} />
        </div>
      </section>

      <section aria-labelledby="billing-faq-title" className="mt-20 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div>
          <h2 id="billing-faq-title" className="text-[24px] font-semibold text-foreground sm:text-[28px]">
            {p.billingFaqTitle}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {t.faq.stillQuestions}{' '}
            <Link href="/contact" className="font-medium text-primary underline-offset-4 hover:underline">
              {t.faq.contact}
            </Link>
          </p>
        </div>
        <FaqList items={p.billingFaq} />
      </section>
    </div>
  )
}
