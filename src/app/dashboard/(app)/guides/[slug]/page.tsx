import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BookOpen, Clock, PenLine, Sparkles } from 'lucide-react'
import { requireStudentReady } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { getDict, getLocale } from '@/lib/i18n/server'
import { format, resolveDict } from '@/lib/i18n/dict'
import { guidesDict } from '@/lib/i18n/dictionaries/guides'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { Badge } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GuideSections, sectionAnchor } from '@/components/guides/guide-sections'
import { MarkReadButton } from '@/components/guides/mark-read-button'
import { getGuide } from '@/features/guides/server'

type Props = { params: Promise<{ slug: string }> }

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const t = await getDict(guidesDict)
  if (!SLUG.test(slug)) return { title: t.metaTitle }
  const profile = await requireStudentReady()
  const guide = await getGuide(await createServerSupabase(), profile.id, slug, await getLocale()).catch(() => null)
  return { title: guide?.title ?? t.metaTitle }
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params
  if (!SLUG.test(slug)) notFound()
  const profile = await requireStudentReady({ next: `/dashboard/guides/${slug}` })
  const [t, locale, db] = await Promise.all([getDict(guidesDict), getLocale(), createServerSupabase()])
  const guide = await getGuide(db, profile.id, slug, locale)
  if (!guide) notFound()

  const lessons = guide.skillId
    ? ((
        await db
          .from('lessons')
          .select('id, title, position')
          .eq('skill_id', guide.skillId)
          .eq('status', 'published')
          .order('position')
          .limit(5)
      ).data ?? [])
    : []

  const practiceHref = guide.skillId
    ? `/dashboard/practice?${new URLSearchParams({
        ...(guide.subjectCode ? { subject: guide.subjectCode } : {}),
        ...(guide.domainId ? { domain: guide.domainId } : {}),
        skill: guide.skillId,
      }).toString()}`
    : null
  const others = guide.availableLocales.filter((l) => l !== guide.locale)

  return (
    <article className="mx-auto max-w-6xl">
      <Breadcrumb
        className="mb-3"
        items={[
          { label: t.title, href: '/dashboard/guides' },
          ...(guide.subjectCode ? [{ label: t.subjects[guide.subjectCode] }] : []),
          ...(guide.domainName ? [{ label: guide.domainName }] : []),
        ]}
      />

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0">
          <header className="mb-8 border-b border-border pb-6" lang={guide.locale}>
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
              {guide.skillName && (
                <Badge variant="outline" className="h-auto max-w-full whitespace-normal py-0.5 text-left">
                  {guide.skillName}
                </Badge>
              )}
              <span className="inline-flex items-center gap-1 tabular">
                <Clock className="size-3.5" aria-hidden />
                {format(t.minutes, { n: guide.readingMinutes })}
              </span>
            </div>
            <h1 className="mt-3 text-[28px] font-semibold leading-tight text-foreground [overflow-wrap:anywhere] sm:text-[34px]">{guide.title}</h1>
            <p className="mt-3 max-w-[68ch] text-[16px] leading-relaxed text-muted-foreground">{guide.summary}</p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <MarkReadButton
                guideId={guide.id}
                slug={guide.slug}
                initialRead={guide.read}
                labels={{ markRead: t.markRead, markedRead: t.markedRead, unmarkRead: t.unmarkRead }}
              />
              {practiceHref && (
                <Button asChild variant="secondary" size="sm">
                  <Link href={practiceHref}>
                    <PenLine aria-hidden /> {t.practiceSkill}
                  </Link>
                </Button>
              )}
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard/ai-tutor">
                  <Sparkles aria-hidden /> {t.askTutor}
                </Link>
              </Button>
            </div>
            {others.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                {format(t.otherLanguage, { list: others.map((l) => t.localeNames[l as keyof typeof t.localeNames] ?? l).join(', ') })}
              </p>
            )}
          </header>

          <div lang={guide.locale}>
            {/* Section labels follow the guide's language, not the interface language. */}
            <GuideSections sections={guide.sections} t={resolveDict(guidesDict, guide.locale as 'uz' | 'en')} />
          </div>

          {(practiceHref || lessons.length > 0) && (
            <footer className="mt-12 grid grid-cols-1 gap-4 border-t border-border pt-8 sm:grid-cols-2">
              {practiceHref && (
                <div className="rounded-lg border border-border bg-card p-5">
                  <p className="font-semibold text-foreground">{t.practiceSkill}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t.practiceHint}</p>
                  <Button asChild size="sm" className="mt-4">
                    <Link href={practiceHref}>{t.practiceSkill}</Link>
                  </Button>
                </div>
              )}
              {lessons.length > 0 && (
                <div className="rounded-lg border border-border bg-card p-5">
                  <p className="font-semibold text-foreground">{t.relatedLessons}</p>
                  <ul className="mt-2 space-y-1.5">
                    {lessons.map((l) => (
                      <li key={l.id}>
                        <Link href={`/dashboard/lesson/${l.id}`} className="inline-flex items-start gap-2 text-sm text-primary hover:underline">
                          <BookOpen className="mt-0.5 size-4 shrink-0" aria-hidden />
                          {l.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </footer>
          )}
        </div>

        {/* Table of contents (desktop) */}
        <nav aria-label={t.onThisPage} className="hidden lg:block">
          <div className="sticky top-8">
            <p className="mb-2 text-xs font-medium text-muted-foreground">{t.onThisPage}</p>
            <ol className="space-y-1 border-l border-border">
              {guide.sections.map((s, i) => (
                <li key={i}>
                  <a
                    href={`#${sectionAnchor(i)}`}
                    className="-ml-px block border-l border-transparent py-1 pl-3 text-[13px] leading-snug text-muted-foreground hover:border-primary hover:text-foreground"
                  >
                    {s.heading}
                  </a>
                </li>
              ))}
            </ol>
            <Link href="/dashboard/guides" className="mt-6 block text-[13px] font-medium text-primary hover:underline">
              ← {t.backToGuides}
            </Link>
          </div>
        </nav>
      </div>
    </article>
  )
}
