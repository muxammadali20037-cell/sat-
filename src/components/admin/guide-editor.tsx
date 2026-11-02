'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { FormField, Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Alert, Badge } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/menus'
import { toast } from '@/components/ui/toast'
import { ContentStatusBadge } from '@/components/admin/status-badge'
import { GuideSections } from '@/components/guides/guide-sections'
import { resolveDict } from '@/lib/i18n/dict'
import { guidesDict } from '@/lib/i18n/dictionaries/guides'
import { GUIDE_LOCALES, SECTION_TYPES, localeContentSchema, skillGuideGaps, type GuideLocale, type GuideSection } from '@/features/guides/schema'
import { deleteGuideContentAction, saveGuideContentAction, saveGuideMetaAction, setGuideStatusAction } from '@/features/guides/admin-actions'

export type GuideEditorData = {
  id: string | null
  status: string
  meta: { slug: string; kind: 'skill' | 'strategy'; skillId: string | null; subjectCode: 'math' | 'reading_writing' | null; position: number; readingMinutes: number }
  contents: Partial<Record<GuideLocale, { title: string; summary: string; sections: unknown[] }>>
}

const LOCALE_NAMES: Record<GuideLocale, string> = { uz: 'Uzbek', en: 'English', ru: 'Russian' }

const TEMPLATES: Record<(typeof SECTION_TYPES)[number], object> = {
  concept: { type: 'concept', heading: 'Bu ko‘nikma nimani tekshiradi', body: '…' },
  recognize: { type: 'recognize', heading: 'Savolni qanday tanib olasiz', items: ['…'] },
  method: { type: 'method', heading: 'Ishlash usuli: qadamma-qadam', steps: ['…', '…', '…'] },
  watch_out: { type: 'watch_out', heading: 'Nimaga e’tibor berish kerak', items: ['…'] },
  traps: { type: 'traps', heading: 'Keng tarqalgan xatolar', items: ['…'] },
  example: { type: 'example', heading: 'Namuna', example: { problem: '…', choices: ['…', '…', '…', '…'], solution: ['…'], answer: 'A' } },
  time: { type: 'time', heading: 'Vaqt bo‘yicha maslahat', items: ['…'] },
  terms: { type: 'terms', heading: 'Muhim inglizcha atamalar', terms: [{ term: '…', meaning: '…' }] },
  checklist: { type: 'checklist', heading: 'Javobni tanlashdan oldin tekshiring', items: ['…'] },
  note: { type: 'note', heading: 'Eslatma', body: '…' },
}

function LocaleEditor({
  guideId,
  locale,
  kind,
  initial,
  canEdit,
}: {
  guideId: string
  locale: GuideLocale
  kind: 'skill' | 'strategy'
  initial?: { title: string; summary: string; sections: unknown[] }
  canEdit: boolean
}) {
  const t = resolveDict(guidesDict, locale)
  const router = useRouter()
  const [title, setTitle] = React.useState(initial?.title ?? '')
  const [summary, setSummary] = React.useState(initial?.summary ?? '')
  const [json, setJson] = React.useState(() => JSON.stringify(initial?.sections ?? [], null, 2))
  const [saving, startSaving] = React.useTransition()

  const validation = React.useMemo(() => {
    let sections: unknown
    try {
      sections = JSON.parse(json)
    } catch (e) {
      return { ok: false as const, errors: [`JSON: ${(e as Error).message}`], sections: [] as GuideSection[] }
    }
    const parsed = localeContentSchema.safeParse({ title, summary, sections })
    if (!parsed.success) {
      return {
        ok: false as const,
        errors: parsed.error.issues.slice(0, 8).map((i) => `${i.path.join('.') || 'content'}: ${i.message}`),
        sections: [] as GuideSection[],
      }
    }
    return { ok: true as const, errors: [] as string[], sections: parsed.data.sections, gaps: kind === 'skill' ? skillGuideGaps(parsed.data) : [] }
  }, [json, title, summary, kind])

  const appendTemplate = (type: (typeof SECTION_TYPES)[number]) => {
    try {
      const arr = JSON.parse(json)
      if (Array.isArray(arr)) setJson(JSON.stringify([...arr, TEMPLATES[type]], null, 2))
    } catch {
      toast.error('Fix the JSON before adding a section.')
    }
  }

  const save = () =>
    startSaving(async () => {
      const res = await saveGuideContentAction({ guideId, locale, title, summary, sectionsJson: json })
      if (res.ok) {
        toast.success(res.message ?? 'Saved')
        router.refresh()
      } else toast.error(res.error)
    })

  const remove = () =>
    startSaving(async () => {
      const res = await deleteGuideContentAction(guideId, locale)
      if (res.ok) {
        toast.success(res.message ?? 'Removed')
        router.refresh()
      } else toast.error(res.error)
    })

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <div className="min-w-0 space-y-4">
        <FormField id={`title-${locale}`} label="Title" required>
          {(a) => <Input {...a} value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canEdit} maxLength={160} />}
        </FormField>
        <FormField id={`summary-${locale}`} label="Summary" description="One or two sentences shown in the guide list.">
          {(a) => <Textarea {...a} rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} disabled={!canEdit} maxLength={600} />}
        </FormField>
        <FormField
          id={`sections-${locale}`}
          label="Sections (JSON)"
          description="Array of sections. Types: concept, recognize, method (steps), watch_out, traps, example (example), time, terms (terms), checklist, note. Text supports **bold**, *italic*, $math$ and “- ” lists."
        >
          {(a) => (
            <Textarea
              {...a}
              rows={24}
              spellCheck={false}
              value={json}
              onChange={(e) => setJson(e.target.value)}
              disabled={!canEdit}
              className="font-mono text-[13px] leading-relaxed"
            />
          )}
        </FormField>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect
              aria-label="Add a section"
              value=""
              onChange={(e) => {
                if (e.target.value) appendTemplate(e.target.value as (typeof SECTION_TYPES)[number])
              }}
              className="w-auto"
            >
              <option value="">Add a section…</option>
              {SECTION_TYPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </NativeSelect>
            <Button onClick={save} loading={saving} disabled={!validation.ok}>
              Save {LOCALE_NAMES[locale]}
            </Button>
            {initial && (
              <Button variant="ghost" onClick={remove} disabled={saving}>
                Remove this language
              </Button>
            )}
          </div>
        )}
        {!validation.ok && (
          <Alert variant="destructive" title="Fix before saving">
            <ul className="list-disc pl-5 text-[13px]">
              {validation.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </Alert>
        )}
        {validation.ok && validation.gaps && validation.gaps.length > 0 && (
          <Alert variant="warning" title="Editorial checklist (skill guides)">
            <ul className="list-disc pl-5 text-[13px]">
              {validation.gaps.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </Alert>
        )}
      </div>
      <div className="min-w-0">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Preview</p>
        <div className="max-h-[80vh] overflow-y-auto rounded-lg border border-border bg-background p-5" lang={locale}>
          <h2 className="text-[22px] font-semibold text-foreground">{title || 'Untitled'}</h2>
          {summary && <p className="mb-6 mt-2 text-sm text-muted-foreground">{summary}</p>}
          {validation.ok ? <GuideSections sections={validation.sections} t={t} /> : <p className="text-sm text-muted-foreground">The preview appears when the content is valid.</p>}
        </div>
      </div>
    </div>
  )
}

export function GuideEditor({
  data,
  skills,
  canEdit,
}: {
  data: GuideEditorData
  skills: { id: string; label: string }[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [meta, setMeta] = React.useState(data.meta)
  const [errors, setErrors] = React.useState<Record<string, string[]>>({})
  const [pending, startTransition] = React.useTransition()

  const saveMeta = () =>
    startTransition(async () => {
      const res = await saveGuideMetaAction(meta, data.id)
      if (res.ok) {
        setErrors({})
        toast.success(res.message ?? 'Saved')
        if (!data.id && res.data) router.push(`/admin/guides/${res.data.id}`)
        else router.refresh()
      } else {
        setErrors(res.fieldErrors ?? {})
        toast.error(res.error)
      }
    })

  const setStatus = (status: string) =>
    startTransition(async () => {
      if (!data.id) return
      const res = await setGuideStatusAction(data.id, status)
      if (res.ok) {
        toast.success(res.message ?? 'Saved')
        router.refresh()
      } else toast.error(res.error)
    })

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold">Settings</h2>
          {data.id && (
            <div className="flex flex-wrap items-center gap-2">
              <ContentStatusBadge status={data.status} />
              {canEdit && data.status !== 'published' && (
                <Button size="sm" onClick={() => setStatus('published')} disabled={pending}>
                  Publish
                </Button>
              )}
              {canEdit && data.status === 'published' && (
                <Button size="sm" variant="secondary" onClick={() => setStatus('draft')} disabled={pending}>
                  Unpublish
                </Button>
              )}
              {canEdit && data.status !== 'archived' && (
                <Button size="sm" variant="ghost" onClick={() => setStatus('archived')} disabled={pending}>
                  Archive
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FormField id="slug" label="URL slug" required error={errors.slug} description="Shown in the address: /dashboard/guides/<slug>">
            {(a) => <Input {...a} value={meta.slug} onChange={(e) => setMeta({ ...meta, slug: e.target.value })} disabled={!canEdit} />}
          </FormField>
          <FormField id="kind" label="Type" required error={errors.kind}>
            {(a) => (
              <NativeSelect
                {...a}
                value={meta.kind}
                onChange={(e) => setMeta({ ...meta, kind: e.target.value as 'skill' | 'strategy', skillId: e.target.value === 'strategy' ? null : meta.skillId })}
                disabled={!canEdit}
              >
                <option value="skill">Skill guide</option>
                <option value="strategy">Strategy guide</option>
              </NativeSelect>
            )}
          </FormField>
          {meta.kind === 'skill' ? (
            <FormField id="skill" label="Skill" required error={errors.skillId}>
              {(a) => (
                <NativeSelect {...a} value={meta.skillId ?? ''} onChange={(e) => setMeta({ ...meta, skillId: e.target.value || null })} disabled={!canEdit}>
                  <option value="">Choose…</option>
                  {skills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
          ) : (
            <FormField id="subject" label="Subject" error={errors.subjectCode}>
              {(a) => (
                <NativeSelect
                  {...a}
                  value={meta.subjectCode ?? ''}
                  onChange={(e) => setMeta({ ...meta, subjectCode: (e.target.value || null) as GuideEditorData['meta']['subjectCode'] })}
                  disabled={!canEdit}
                >
                  <option value="">General</option>
                  <option value="math">Math</option>
                  <option value="reading_writing">Reading and Writing</option>
                </NativeSelect>
              )}
            </FormField>
          )}
          <FormField id="position" label="Order" error={errors.position}>
            {(a) => <Input {...a} type="number" min={0} max={999} value={meta.position} onChange={(e) => setMeta({ ...meta, position: Number(e.target.value) })} disabled={!canEdit} />}
          </FormField>
          <FormField id="minutes" label="Reading time (minutes)" error={errors.readingMinutes}>
            {(a) => (
              <Input {...a} type="number" min={1} max={60} value={meta.readingMinutes} onChange={(e) => setMeta({ ...meta, readingMinutes: Number(e.target.value) })} disabled={!canEdit} />
            )}
          </FormField>
        </div>
        {canEdit && (
          <Button className="mt-4" onClick={saveMeta} loading={pending}>
            {data.id ? 'Save settings' : 'Create guide'}
          </Button>
        )}
      </section>

      {data.id && (
        <section>
          <h2 className="mb-3 text-[17px] font-semibold">Content</h2>
          <Tabs defaultValue="uz">
            <TabsList aria-label="Language">
              {GUIDE_LOCALES.map((l) => (
                <TabsTrigger key={l} value={l}>
                  {LOCALE_NAMES[l]} {data.contents[l] ? <Badge variant="success" className="ml-1.5">✓</Badge> : null}
                </TabsTrigger>
              ))}
            </TabsList>
            {GUIDE_LOCALES.map((l) => (
              <TabsContent key={l} value={l} className="pt-5">
                <LocaleEditor guideId={data.id!} locale={l} kind={meta.kind} initial={data.contents[l]} canEdit={canEdit} />
              </TabsContent>
            ))}
          </Tabs>
        </section>
      )}
    </div>
  )
}
