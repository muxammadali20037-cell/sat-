import type { Metadata } from 'next'
import { ExternalLink, Info, Library } from 'lucide-react'
import { requireStudentReady } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { getDict } from '@/lib/i18n/server'
import { format } from '@/lib/i18n/dict'
import { resourcesDict } from '@/lib/i18n/dictionaries/resources'
import { PageHeader } from '@/components/layout/page-header'
import { Badge, Card } from '@/components/ui/card'
import { getTaxonomy } from '@/features/taxonomy/server'
import { loadHub } from '@/features/resources/server'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDict(resourcesDict)).metaTitle }
}

export default async function ResourcesPage() {
  await requireStudentReady({ next: '/dashboard/resources' })
  const [t, db] = await Promise.all([getDict(resourcesDict), createServerSupabase()])
  const taxonomy = await getTaxonomy(db)
  const sections = await loadHub(db, taxonomy)

  return (
    <>
      <PageHeader title={t.title} description={t.description} />
      <p className="mb-6 flex max-w-3xl items-start gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-[13px] text-muted-foreground" data-testid="resources-notice">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t.notice}
      </p>
      {sections.length === 0 ? (
        <Card className="flex max-w-2xl flex-col items-start gap-2 p-6">
          <Library className="size-5 text-muted-foreground" aria-hidden />
          <h2 className="text-[15px] font-semibold">{t.emptyTitle}</h2>
          <p className="text-sm text-muted-foreground">{t.emptyBody}</p>
        </Card>
      ) : (
        <div className="space-y-8">
          {sections.map((section) => (
            <section key={section.key} aria-labelledby={`res-${section.key}`}>
              <h2 id={`res-${section.key}`} className="mb-3 text-[15px] font-semibold text-foreground">
                {section.scope === 'general' ? t.general : section.scope === 'subject' && section.subjectCode ? t.subjects[section.subjectCode] : section.title}
                {section.scope === 'domain' && section.subjectCode && <span className="ml-2 text-[13px] font-normal text-muted-foreground">{t.subjects[section.subjectCode]}</span>}
              </h2>
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {section.items.map((r) => (
                  <li key={r.id}>
                    <Card className="flex h-full flex-col gap-2 p-4">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <Badge variant="neutral">{r.provider_name}</Badge>
                        <Badge variant="neutral">{t.kinds[r.kind as keyof typeof t.kinds] ?? r.kind}</Badge>
                        <span className="text-muted-foreground">{t.languages[r.language as keyof typeof t.languages] ?? r.language}</span>
                      </div>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="group inline-flex items-start gap-1.5 text-[15px] font-medium text-foreground hover:text-primary"
                      >
                        <span>{r.title}</span>
                        <ExternalLink className="mt-1 size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
                        <span className="sr-only">({format(t.opens, { host: r.host })})</span>
                      </a>
                      {r.skillName && <p className="text-xs text-muted-foreground">{r.skillName}</p>}
                      {r.description && <p className="text-sm text-muted-foreground">{r.description}</p>}
                      <div className="mt-auto space-y-0.5 border-t border-border pt-2 text-xs text-muted-foreground">
                        <p>{format(t.opens, { host: r.host })} · {r.attribution}</p>
                        <p>
                          {t.terms}: {r.usage_terms}
                        </p>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
