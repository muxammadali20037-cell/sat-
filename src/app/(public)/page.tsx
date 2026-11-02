import Link from 'next/link'
import { BarChart3, BookOpen, Check, ListChecks, PenLine, Sparkles, Target, Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress'
import { HeroDemo } from '@/components/marketing/hero-demo'
import { DashboardPreview, ProgressPreview } from '@/components/marketing/product-previews'
import { MarketingSection } from '@/components/marketing/section'
import { TutorExample } from '@/components/marketing/tutor-example'
import { PlanCards } from '@/components/marketing/pricing'
import { FaqList } from '@/components/marketing/faq-list'
import { loadPublicPlans } from '@/components/marketing/load-plans'
import { getDict, getPublicLocale } from '@/lib/i18n/server'
import { publicDict, type PublicDict } from '@/lib/i18n/dictionaries/public'

const PLATFORM_ICONS = [BookOpen, PenLine, Target, Timer, Sparkles, ListChecks]
const DIAGNOSTIC_CTA = '/register?next=/dashboard/diagnostic'
const practiceHref = (subject: 'math' | 'reading_writing') =>
  `/register?next=${encodeURIComponent(`/dashboard/practice?subject=${subject}`)}`

function SubjectBlock({
  id,
  t,
  practiceHref,
  reverse,
}: {
  id: string
  t: PublicDict['math'] | PublicDict['rw']
  practiceHref: string
  reverse?: boolean
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="py-16 sm:py-20">
      <div className="mx-auto grid grid-cols-1 max-w-[1200px] gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-16 lg:px-8">
        <div className={reverse ? 'lg:order-2' : undefined}>
          <p className="text-sm font-medium text-muted-foreground tabular">{t.meta}</p>
          <h2 id={`${id}-title`} className="mt-2 text-[26px] font-semibold leading-tight text-foreground sm:text-[32px]">
            {t.title}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">{t.description}</p>
          <Button asChild variant="secondary" className="mt-6">
            <Link href={practiceHref}>{t.cta}</Link>
          </Button>
        </div>
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {t.domains.map((domain) => {
            const share = Number.parseInt(domain.share.replace(/\D+/g, ''), 10) || 0
            return (
              <li key={domain.name} className="grid grid-cols-1 gap-2 p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="text-base font-semibold text-foreground">{domain.name}</h3>
                  <span className="text-sm text-muted-foreground tabular">{domain.share}</span>
                </div>
                <ProgressBar value={share} max={40} label={`${domain.name}: ${domain.share}`} tone="navy" size="sm" />
                <p className="text-sm text-muted-foreground">{domain.skills}</p>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

export default async function HomePage() {
  const [t, locale, plans] = await Promise.all([getDict(publicDict, { public: true }), getPublicLocale(), loadPublicPlans()])

  return (
    <>
      {/* 2 · Hero on the navy field; the live product preview overlaps into the next section. */}
      <section aria-labelledby="hero-title" className="bg-navy-900 text-white">
        <div className="mx-auto max-w-[1200px] px-4 pb-44 pt-12 text-center sm:px-6 sm:pb-52 sm:pt-20 lg:px-8">
          <h1
            id="hero-title"
            className="mx-auto max-w-3xl text-[38px] font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-[52px] lg:text-[56px]"
          >
            {t.hero.title}
          </h1>
          <p className="mx-auto mt-5 max-w-[60ch] text-[17px] leading-relaxed text-white/75 sm:text-lg">{t.hero.subtitle}</p>
          <div className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
            <Button asChild size="lg" className="h-auto min-h-12 whitespace-normal py-3 text-center">
              <Link href={DIAGNOSTIC_CTA}>{t.hero.primaryCta}</Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="h-auto min-h-12 whitespace-normal py-3 text-center border border-white/25 text-white hover:bg-white/10">
              <Link href="/features">{t.hero.secondaryCta}</Link>
            </Button>
          </div>
          <ul className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-white/75">
            {t.hero.bullets.map((bullet) => (
              <li key={bullet} className="inline-flex items-center gap-1.5">
                <Check className="size-4 text-accent" aria-hidden />
                {bullet}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-label={t.hero.previewTitle} className="relative -mt-36 px-4 sm:-mt-44 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1080px]">
          <div className="rounded-[22px] border border-white/10 bg-navy-800 p-2 sm:p-3 dark:border-border dark:bg-muted">
            <HeroDemo
              labels={{
                ...t.demo,
                preview: t.labels.preview,
                sampleData: t.labels.sampleData,
              }}
            />
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">{t.demo.source}</p>
        </div>
      </section>

      {/* 3 · Product demonstration */}
      <MarketingSection id="dashboard" tone="surface" title={t.dashboardPreview.title} description={t.dashboardPreview.description}>
        <DashboardPreview t={t.dashboardPreview} labels={t.labels} />
      </MarketingSection>

      {/* 4 · Learning features */}
      <MarketingSection id="platform" title={t.platform.title} description={t.platform.description}>
        <ul className="grid grid-cols-1 overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-2 lg:grid-cols-3">
          {t.platform.items.map((item, i) => {
            const Icon = PLATFORM_ICONS[i % PLATFORM_ICONS.length]!
            return (
              <li key={item.title} className="-mb-px -mr-px border-b border-r border-border p-6">
                <Icon className="size-5 text-primary" aria-hidden />
                <h3 className="mt-4 text-base font-semibold text-foreground">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </li>
            )
          })}
        </ul>
      </MarketingSection>

      {/* 5 · SAT Math and 6 · Reading and Writing */}
      <SubjectBlock id="math" t={t.math} practiceHref={practiceHref('math')} />
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <div className="h-px bg-border" />
      </div>
      <SubjectBlock id="reading-writing" t={t.rw} practiceHref={practiceHref('reading_writing')} reverse />

      {/* 7 · AI tutor demonstration */}
      <section id="ai-tutor" aria-labelledby="ai-tutor-title" className="border-y border-border bg-surface py-16 sm:py-24">
        <div className="mx-auto grid grid-cols-1 max-w-[1200px] gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8">
          <div>
            <h2 id="ai-tutor-title" className="text-[26px] font-semibold leading-tight text-foreground sm:text-[32px]">
              {t.tutor.title}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-[17px]">{t.tutor.description}</p>
          </div>
          <TutorExample t={t.tutor} exampleLabel={t.labels.example} />
        </div>
      </section>

      {/* 8 · Personalized learning process (a real sequence) */}
      <MarketingSection id="process" title={t.process.title} description={t.process.description}>
        <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
          {t.process.steps.map((step, i) => (
            <li key={step.title} className="bg-card p-5">
              <span className="font-display text-sm font-semibold text-primary tabular">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="mt-3 text-base font-semibold text-foreground">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </MarketingSection>

      {/* 9 · Mock exam environment (the navy exam room) */}
      <section id="mock-exams" aria-labelledby="mock-exams-title" className="px-4 pb-16 sm:px-6 sm:pb-24 lg:px-8">
        <div className="mx-auto max-w-[1200px] rounded-xl bg-navy-900 p-6 text-white sm:p-10 lg:p-12">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
            <div>
              <h2 id="mock-exams-title" className="text-[26px] font-semibold leading-tight text-white sm:text-[32px]">
                {t.mockExam.title}
              </h2>
              <p className="mt-3 text-base leading-relaxed text-white/75">{t.mockExam.description}</p>
              <ul className="mt-6 grid grid-cols-1 gap-3">
                {t.mockExam.features.map((feature) => (
                  <li key={feature} className="flex gap-3 text-[15px] text-white/85">
                    <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                    {feature}
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-xs text-white/55">{t.mockExam.disclaimer}</p>
              <Button asChild size="lg" className="mt-6 h-auto min-h-12 whitespace-normal py-3 text-center">
                <Link href="/pricing">{t.mockExam.cta}</Link>
              </Button>
            </div>
            <div>
              <p className="text-sm font-medium text-white/60">{t.mockExam.timelineLabel}</p>
              <ol className="mt-4 grid grid-cols-1 gap-2">
                {t.mockExam.timeline.map((part, i) => {
                  const isBreak = i === 2
                  return (
                    <li
                      key={part.name}
                      className={
                        isBreak
                          ? 'rounded-lg border border-dashed border-white/20 px-4 py-3'
                          : 'rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3'
                      }
                    >
                      <p className="text-[15px] font-medium text-white">{part.name}</p>
                      <p className="mt-0.5 text-[13px] text-white/60 tabular">{part.meta}</p>
                    </li>
                  )
                })}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* 10 · Student progress demonstration */}
      <MarketingSection
        id="progress"
        tone="surface"
        title={t.progress.title}
        description={t.progress.description}
        aside={<BarChart3 className="hidden size-6 text-primary md:block" aria-hidden />}
      >
        <ProgressPreview t={t.progress} labels={t.labels} />
      </MarketingSection>

      {/* 11 · Subscription plans (from the database) */}
      <MarketingSection
        id="pricing"
        title={t.pricing.title}
        description={t.pricing.description}
        aside={
          <Button asChild variant="link" className="self-start md:self-end">
            <Link href="/pricing">{t.pricing.compare}</Link>
          </Button>
        }
      >
        <PlanCards plans={plans} t={t.pricing} locale={locale} />
        <p className="mt-6 max-w-3xl text-sm text-muted-foreground">{t.pricing.billingNote}</p>
      </MarketingSection>

      {/* 12 · FAQ */}
      <MarketingSection
        id="faq"
        tone="surface"
        title={t.faq.title}
        description={t.faq.description}
        aside={
          <Button asChild variant="link" className="self-start md:self-end">
            <Link href="/faq">{t.faq.all}</Link>
          </Button>
        }
      >
        <FaqList items={t.faq.items.slice(0, 6)} className="max-w-4xl" />
      </MarketingSection>

      {/* 13 · Final call to action */}
      <section aria-labelledby="final-cta-title" className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 text-center sm:px-6 lg:px-8">
          <h2 id="final-cta-title" className="mx-auto max-w-2xl text-[28px] font-semibold leading-tight text-foreground sm:text-[36px]">
            {t.finalCta.title}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base text-muted-foreground sm:text-[17px]">{t.finalCta.body}</p>
          <div className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
            <Button asChild size="lg" className="h-auto min-h-12 whitespace-normal py-3 text-center">
              <Link href={DIAGNOSTIC_CTA}>{t.finalCta.primary}</Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="h-auto min-h-12 whitespace-normal py-3 text-center">
              <Link href="/pricing">{t.finalCta.secondary}</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
