import type { Metadata } from 'next'
import Link from 'next/link'
import { CircleCheck, Clock, Languages } from 'lucide-react'
import { requireStudentReady } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { getDict, getLocale } from '@/lib/i18n/server'
import { format } from '@/lib/i18n/dict'
import { guidesDict, type GuidesDict } from '@/lib/i18n/dictionaries/guides'
import { PageHeader, Section } from '@/components/layout/page-header'
import { Alert } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { ProgressBar } from '@/components/ui/progress'
import { cn, formatPercent } from '@/lib/utils'
import { listGuides, type GuideListItem } from '@/features/guides/server'
import { getTaxonomy } from '@/features/taxonomy/server'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict(guidesDict)
  return { title: t.metaTitle }
}

const SUBJECTS = ['math', 'reading_writing'] as const

function ReadMark({ read, t }: { read: boolean; t: GuidesDict }) {
  return read ? (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-success">
      <CircleCheck className="size-4" aria-hidden /> {t.read}
    </span>
  ) : null
}

function GuideRow({ guide, t, index }: { guide: GuideListItem; t: GuidesDict; index?: number }) {
  return (
    <li>
      <Link
        href={`/dashboard/guides/${guide.slug}`}
        className="group flex items-start gap-4 px-4 py-3.5 transition-colors hover:bg-muted/50 sm:px-5"
      >
        {index !== undefined && (
          <span
            className={cn(
              'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tabular',
              guide.read ? 'bg-success-soft text-success' : 'bg-primary-soft text-primary',
            )}
          >
            {index + 1}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium text-foreground group-hover:text-primary">{guide.title}</span>
          <span className="mt-0.5 line-clamp-2 block text-[13px] text-muted-foreground">{guide.summary}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular">
            <Clock className="size-3.5" aria-hidden />
            {format(t.minutes, { n: guide.readingMinutes })}
          </span>
          <ReadMark read={guide.read} t={t} />
        </span>
      </Link>
    </li>
  )
}

export default async function GuidesPage() {
  const profile = await requireStudentReady()
  const [t, locale, db] = await Promise.all([getDict(guidesDict), getLocale(), createServerSupabase()])
  const [guides, taxonomy, perf] = await Promise.all([
    listGuides(db, profile.id, locale),
    getTaxonomy(db),
    db.rpc('my_skill_performance'),
  ])

  if (guides.length === 0) {
    return (
      <>
        <PageHeader title={t.title} description={t.description} />
        <EmptyState icon={<Languages />} title={t.empty} description={t.emptyHint} />
      </>
    )
  }

  const strategy = guides.filter((g) => g.kind === 'strategy').sort((a, b) => a.position - b.position)
  const skillGuides = guides.filter((g) => g.kind === 'skill')
  const bySkill = new Map(skillGuides.map((g) => [g.skillId, g]))

  // Weakest practised skills that have a guide (accuracy from scored answers only).
  const recommended = (perf.data ?? [])
    .filter((p) => p.answered > 0 && bySkill.has(p.skill_id))
    .map((p) => ({ guide: bySkill.get(p.skill_id)!, accuracy: p.correct / p.answered, answered: p.answered }))
    .sort((a, b) => a.accuracy - b.accuracy || b.answered - a.answered)
    .filter((r) => r.accuracy < 0.8)
    .slice(0, 3)

  const readCount = guides.filter((g) => g.read).length

  return (
    <>
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <div className="w-full min-w-48 sm:w-56">
            <p className="mb-1.5 text-xs text-muted-foreground tabular">{format(t.readCount, { read: readCount, total: guides.length })}</p>
            <ProgressBar value={readCount} max={guides.length} size="sm" label={format(t.readCount, { read: readCount, total: guides.length })} />
          </div>
        }
      />

      <div className="space-y-10">
        {locale !== 'uz' && <Alert variant="primary" icon={<Languages />} title={t.languageNote} />}

        {recommended.length > 0 && (
          <Section title={t.forYou} description={t.forYouHint}>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {recommended.map(({ guide, accuracy, answered }) => (
                <li key={guide.id}>
                  <Link
                    href={`/dashboard/guides/${guide.slug}`}
                    className="flex h-full flex-col rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
                  >
                    <span className="text-xs text-muted-foreground">{guide.domainName}</span>
                    <span className="mt-1 text-[15px] font-semibold text-foreground">{guide.title}</span>
                    <span className="mt-auto pt-3 text-[13px] text-destructive tabular">
                      {format(t.accuracy, { pct: formatPercent(accuracy), n: answered })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {strategy.length > 0 && (
          <Section title={t.strategyTitle} description={t.strategyHint}>
            <ol className="divide-y divide-border rounded-lg border border-border bg-card">
              {strategy.map((g, i) => (
                <GuideRow key={g.id} guide={g} t={t} index={i} />
              ))}
            </ol>
          </Section>
        )}

        {skillGuides.length > 0 && (
          <Section title={t.skillsTitle}>
            <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
              {SUBJECTS.map((subject) => {
                const domains = taxonomy.domains
                  .filter((d) => taxonomy.subjectById.get(d.subjectId)?.code === subject)
                  .sort((a, b) => a.position - b.position)
                const subjectGuides = skillGuides.filter((g) => g.subjectCode === subject)
                if (subjectGuides.length === 0) return null
                const subjectRead = subjectGuides.filter((g) => g.read).length
                return (
                  <div key={subject} className="min-w-0">
                    <div className="mb-3 flex items-baseline justify-between gap-3">
                      <h3 className="text-[17px] font-semibold text-foreground">{t.subjects[subject]}</h3>
                      <span className="text-xs text-muted-foreground tabular">{format(t.readCount, { read: subjectRead, total: subjectGuides.length })}</span>
                    </div>
                    <div className="space-y-4">
                      {domains.map((domain) => {
                        const skills = taxonomy.skills.filter((s) => s.domainId === domain.id).sort((a, b) => a.position - b.position)
                        return (
                          <div key={domain.id} className="rounded-lg border border-border bg-card">
                            <p className="border-b border-border px-4 py-2.5 text-[13px] font-semibold text-foreground sm:px-5">{domain.name}</p>
                            <ul className="divide-y divide-border">
                              {skills.map((skill) => {
                                const guide = bySkill.get(skill.id)
                                return guide ? (
                                  <GuideRow key={skill.id} guide={guide} t={t} />
                                ) : (
                                  <li key={skill.id} className="flex items-center justify-between gap-3 px-4 py-3 text-[15px] text-muted-foreground sm:px-5">
                                    <span className="min-w-0">{skill.name}</span>
                                    <span className="shrink-0 text-xs">{t.noGuideYet}</span>
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>
        )}
      </div>
    </>
  )
}
