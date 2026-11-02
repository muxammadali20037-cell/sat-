import type { Metadata } from 'next'
import Link from 'next/link'
import { BarChart3, BookOpen, Check, ListChecks, PenLine, Sparkles, Target, Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getDict } from '@/lib/i18n/server'
import { publicDict } from '@/lib/i18n/dictionaries/public'

const ICONS = [Target, BookOpen, PenLine, Timer, Sparkles, ListChecks, BarChart3]
const SLUGS = ['diagnostic', 'lessons', 'practice', 'mock-exams', 'ai-tutor', 'study-plan', 'analytics']

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict(publicDict, { public: true })
  return { title: t.meta.featuresTitle, description: t.meta.featuresDescription }
}

export default async function FeaturesPage() {
  const t = await getDict(publicDict, { public: true })
  const f = t.featuresPage
  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-[1200px] px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <h1 className="max-w-3xl text-[32px] font-semibold leading-tight text-foreground sm:text-[44px]">{f.title}</h1>
          <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">{f.description}</p>
          <nav aria-label={t.meta.featuresTitle} className="mt-8">
            <ul className="flex flex-wrap gap-2">
              {f.sections.map((section, i) => (
                <li key={section.title}>
                  <a
                    href={`#${SLUGS[i]}`}
                    className="inline-flex h-10 items-center rounded-md border border-border bg-background px-3 text-sm text-foreground hover:bg-muted"
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        {f.sections.map((section, i) => {
          const Icon = ICONS[i % ICONS.length]!
          return (
            <section
              key={section.title}
              id={SLUGS[i]}
              aria-labelledby={`${SLUGS[i]}-title`}
              className="grid grid-cols-1 scroll-mt-6 gap-6 border-b border-border py-10 last:border-0 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12"
            >
              <div>
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h2 id={`${SLUGS[i]}-title`} className="mt-4 text-[22px] font-semibold leading-tight text-foreground sm:text-[26px]">
                  {section.title}
                </h2>
                <p className="mt-2 text-base leading-relaxed text-muted-foreground">{section.body}</p>
              </div>
              <ul className="grid grid-cols-1 content-start gap-3">
                {section.points.map((point) => (
                  <li key={point} className="flex gap-3 rounded-lg border border-border bg-card p-4 text-[15px] text-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      <section className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-[1200px] flex-col items-start gap-5 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div>
            <h2 className="text-[24px] font-semibold text-foreground sm:text-[28px]">{t.finalCta.title}</h2>
            <p className="mt-2 text-muted-foreground">{t.finalCta.body}</p>
          </div>
          <Button asChild size="lg" className="h-auto min-h-12 whitespace-normal py-3 text-center">
            <Link href="/register?next=/dashboard/diagnostic">{f.cta}</Link>
          </Button>
        </div>
      </section>
    </>
  )
}
