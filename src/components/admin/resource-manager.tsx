'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import type { ActionResult } from '@/lib/api/errors'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/card'
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { publishWorkingDraftsAction, saveResourceAction, setResourceStatusAction } from '@/features/resources/actions'
import { KINDS, PROVIDER_DEFAULTS, PROVIDERS, linkWorks, type Provider } from '@/features/resources/rules'
import type { ResourceRow } from '@/features/resources/server'

type Taxo = {
  subjects: Array<{ id: string; name: string }>
  domains: Array<{ id: string; name: string; subjectId: string }>
  skills: Array<{ id: string; name: string; domainId: string }>
}

const PROVIDER_LABEL: Record<Provider, string> = {
  sat_master: 'SAT MASTER',
  college_board: 'College Board',
  khan_academy: 'Khan Academy',
  desmos: 'Desmos',
  youtube: 'YouTube',
  openstax: 'OpenStax',
  gutenberg: 'Project Gutenberg',
  other: 'Other',
}
const KIND_LABEL: Record<(typeof KINDS)[number], string> = {
  lesson: 'Lesson',
  video: 'Video',
  practice: 'Practice',
  tool: 'Tool',
  official_info: 'Official information',
  article: 'Article',
  book: 'Book',
}
const field = 'grid grid-cols-1 gap-1.5'

type FormState = {
  id?: string
  provider: Provider
  providerName: string
  kind: (typeof KINDS)[number]
  title: string
  description: string
  url: string
  language: 'en' | 'uz' | 'ru'
  subjectId: string
  domainId: string
  skillId: string
  usageTerms: string
  attribution: string
  position: number
}

const empty = (provider: Provider = 'college_board'): FormState => ({
  provider,
  providerName: PROVIDER_DEFAULTS[provider].name,
  kind: 'official_info',
  title: '',
  description: '',
  url: '',
  language: 'en',
  subjectId: '',
  domainId: '',
  skillId: '',
  usageTerms: PROVIDER_DEFAULTS[provider].usageTerms,
  attribution: PROVIDER_DEFAULTS[provider].attribution,
  position: 0,
})

export function ResourceManager({ rows, taxonomy, canEdit }: { rows: ResourceRow[]; taxonomy: Taxo; canEdit: boolean }) {
  const router = useRouter()
  const [form, setForm] = React.useState<FormState>(empty())
  const [pending, setPending] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string[]>>({})
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function run<T>(fn: () => Promise<ActionResult<T>>, after?: () => void) {
    setPending(true)
    try {
      const res = await fn()
      if (res.ok) {
        if (res.message) toast.success(res.message)
        after?.()
        router.refresh()
      } else {
        toast.error(res.error)
        setErrors(res.fieldErrors ?? {})
      }
    } finally {
      setPending(false)
    }
  }

  const domains = taxonomy.domains.filter((d) => !form.subjectId || d.subjectId === form.subjectId)
  const skills = taxonomy.skills.filter((s) => (form.domainId ? s.domainId === form.domainId : domains.some((d) => d.id === s.domainId)))
  const where = (r: ResourceRow) =>
    (r.skill_id && taxonomy.skills.find((s) => s.id === r.skill_id)?.name) ||
    (r.domain_id && taxonomy.domains.find((d) => d.id === r.domain_id)?.name) ||
    (r.subject_id && taxonomy.subjects.find((s) => s.id === r.subject_id)?.name) ||
    'General'

  const draftCount = rows.filter((r) => r.status === 'draft').length
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="min-w-0 space-y-2">
        {canEdit && draftCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3 text-sm">
            <span className="text-muted-foreground">{draftCount} draft(s). Each link is checked now; only links that answer are published.</span>
            <Button type="button" size="sm" loading={pending} onClick={() => run(() => publishWorkingDraftsAction())}>
              Check and publish drafts
            </Button>
          </div>
        )}
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            No resources yet. Add links to official SAT information, free lessons or tools. Students see a link only after you publish it, and only if it answers when published.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3" data-resource={r.id}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{r.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.provider_name} · {KIND_LABEL[r.kind as keyof typeof KIND_LABEL] ?? r.kind} · {r.language.toUpperCase()} · {where(r)}
                  </p>
                  <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1 truncate text-xs text-primary hover:underline">
                    {r.url} <ExternalLink className="size-3 shrink-0" aria-hidden />
                  </a>
                  <p className="text-xs text-muted-foreground">
                    Link check: {r.link_status ?? 'no answer'}
                    {linkWorks(r.link_status) ? ' ✓' : ' — fix before publishing'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Badge variant={r.status === 'published' ? 'success' : r.status === 'archived' ? 'neutral' : 'warning'}>{r.status}</Badge>
                  {canEdit && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        onClick={() =>
                          setForm({
                            id: r.id,
                            provider: r.provider as Provider,
                            providerName: r.provider_name,
                            kind: r.kind as FormState['kind'],
                            title: r.title,
                            description: r.description,
                            url: r.url,
                            language: r.language as FormState['language'],
                            subjectId: r.subject_id ?? '',
                            domainId: r.domain_id ?? '',
                            skillId: r.skill_id ?? '',
                            usageTerms: r.usage_terms,
                            attribution: r.attribution,
                            position: r.position,
                          })
                        }
                      >
                        Edit
                      </Button>
                      {r.status !== 'published' && (
                        <Button size="sm" disabled={pending} onClick={() => run(() => setResourceStatusAction({ id: r.id, status: 'published' }))}>
                          Publish
                        </Button>
                      )}
                      {r.status === 'published' && (
                        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => setResourceStatusAction({ id: r.id, status: 'draft' }))}>
                          Unpublish
                        </Button>
                      )}
                      {r.status !== 'archived' && (
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setResourceStatusAction({ id: r.id, status: 'archived' }))}>
                          Archive
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canEdit && (
        <form
          className="space-y-3 rounded-lg border border-border bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault()
            setErrors({})
            run(
              () =>
                saveResourceAction({
                  ...form,
                  subjectId: form.subjectId || null,
                  domainId: form.domainId || null,
                  skillId: form.skillId || null,
                }),
              () => setForm(empty(form.provider)),
            )
          }}
        >
          <h2 className="text-[15px] font-semibold">{form.id ? 'Edit resource' : 'Add a resource'}</h2>
          <p className="text-xs text-muted-foreground">
            Only link to pages you are allowed to link to. Never copy or embed third-party questions, videos or logos. The server checks the link and the provider’s domain.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className={field}>
              <Label htmlFor="res-provider">Provider</Label>
              <NativeSelect
                id="res-provider"
                value={form.provider}
                onChange={(e) => {
                  const p = e.target.value as Provider
                  setForm((f) => ({ ...f, provider: p, providerName: PROVIDER_DEFAULTS[p].name, usageTerms: PROVIDER_DEFAULTS[p].usageTerms, attribution: PROVIDER_DEFAULTS[p].attribution }))
                }}
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABEL[p]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className={field}>
              <Label htmlFor="res-kind">Type</Label>
              <NativeSelect id="res-kind" value={form.kind} onChange={(e) => set('kind', e.target.value as FormState['kind'])}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className={field}>
            <Label htmlFor="res-pname">Provider name shown to students</Label>
            <Input id="res-pname" value={form.providerName} onChange={(e) => set('providerName', e.target.value)} required minLength={2} maxLength={80} />
          </div>
          <div className={field}>
            <Label htmlFor="res-url">Link (https://)</Label>
            <Input id="res-url" type="url" value={form.url} onChange={(e) => set('url', e.target.value)} required maxLength={600} aria-invalid={!!errors.url} />
            {errors.url && <p className="text-xs text-destructive">{errors.url[0]}</p>}
          </div>
          <div className={field}>
            <Label htmlFor="res-title">Title</Label>
            <Input id="res-title" value={form.title} onChange={(e) => set('title', e.target.value)} required minLength={3} maxLength={160} />
          </div>
          <div className={field}>
            <Label htmlFor="res-desc">Short description</Label>
            <Textarea id="res-desc" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={600} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className={field}>
              <Label htmlFor="res-lang">Language</Label>
              <NativeSelect id="res-lang" value={form.language} onChange={(e) => set('language', e.target.value as FormState['language'])}>
                <option value="en">English</option>
                <option value="uz">Uzbek</option>
                <option value="ru">Russian</option>
              </NativeSelect>
            </div>
            <div className={field}>
              <Label htmlFor="res-pos">Order</Label>
              <Input id="res-pos" type="number" min={0} max={10000} value={form.position} onChange={(e) => set('position', Number(e.target.value) || 0)} />
            </div>
          </div>
          <div className={field}>
            <Label htmlFor="res-subject">Subject</Label>
            <NativeSelect id="res-subject" value={form.subjectId} onChange={(e) => setForm((f) => ({ ...f, subjectId: e.target.value, domainId: '', skillId: '' }))}>
              <option value="">General (any subject)</option>
              {taxonomy.subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className={field}>
              <Label htmlFor="res-domain">Domain</Label>
              <NativeSelect id="res-domain" value={form.domainId} onChange={(e) => setForm((f) => ({ ...f, domainId: e.target.value, skillId: '' }))}>
                <option value="">Any</option>
                {domains.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className={field}>
              <Label htmlFor="res-skill">Skill</Label>
              <NativeSelect id="res-skill" value={form.skillId} onChange={(e) => set('skillId', e.target.value)}>
                <option value="">Any</option>
                {skills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className={field}>
            <Label htmlFor="res-terms">Usage terms</Label>
            <Textarea id="res-terms" rows={2} value={form.usageTerms} onChange={(e) => set('usageTerms', e.target.value)} required minLength={3} maxLength={300} />
          </div>
          <div className={field}>
            <Label htmlFor="res-attr">Attribution (shown under the link)</Label>
            <Input id="res-attr" value={form.attribution} onChange={(e) => set('attribution', e.target.value)} required minLength={2} maxLength={200} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={pending}>
              {form.id ? 'Save changes' : 'Save as draft'}
            </Button>
            {form.id && (
              <Button type="button" variant="ghost" onClick={() => setForm(empty())}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  )
}
