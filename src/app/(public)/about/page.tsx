import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getDict } from '@/lib/i18n/server'
import { publicDict } from '@/lib/i18n/dictionaries/public'
import { commonDict } from '@/lib/i18n/dictionaries/common'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict(publicDict, { public: true })
  return { title: t.meta.aboutTitle, description: t.meta.aboutDescription }
}

export default async function AboutPage() {
  const [t, common] = await Promise.all([getDict(publicDict, { public: true }), getDict(commonDict, { public: true })])
  const a = t.aboutPage
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <header className="max-w-3xl">
        <h1 className="text-[32px] font-semibold leading-tight text-foreground sm:text-[44px]">{a.title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{a.lead}</p>
      </header>

      <div className="mt-14 grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
        {a.sections.map((section, i) => (
          <section key={section.title} aria-labelledby={`about-section-${i}`}>
            <h2 id={`about-section-${i}`} className="text-[22px] font-semibold text-foreground sm:text-[26px]">
              {section.title}
            </h2>
            {section.body.map((paragraph) => (
              <p key={paragraph.slice(0, 40)} className="mt-4 text-base leading-relaxed text-muted-foreground">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>

      <section aria-labelledby="principles-title" className="mt-16 border-t border-border pt-14">
        <h2 id="principles-title" className="text-[22px] font-semibold text-foreground sm:text-[26px]">
          {a.principlesTitle}
        </h2>
        <dl className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
          {a.principles.map((principle) => (
            <div key={principle.title} className="bg-card p-6">
              <dt className="text-base font-semibold text-foreground">{principle.title}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{principle.body}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 max-w-3xl text-xs leading-relaxed text-muted-foreground">{common.footer.disclaimer}</p>
      </section>

      <section className="mt-16 flex flex-col items-start gap-5 rounded-xl border border-border bg-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{a.contactTitle}</h2>
          <p className="mt-1 text-muted-foreground">{a.contactBody}</p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/contact">{a.contactCta}</Link>
        </Button>
      </section>
    </div>
  )
}
