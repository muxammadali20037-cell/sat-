'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Archive, CheckCircle2, Copy, Eye, EyeOff, ImageIcon, Plus, RotateCcw, Save, Send, Trash2, X } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { FormField, Input, Label, NativeSelect, Textarea } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/controls'
import { toast } from '@/components/ui/toast'
import { QuestionCard } from '@/components/learning/question-card'
import { QuestionStatusBadge } from '@/components/admin/status-badge'
import { RichTextHelp } from '@/components/admin/rich-text-help'
import { useSignedUpload } from '@/components/admin/use-signed-upload'
import {
  DIFFICULTIES,
  LIMITS,
  OPTION_LABELS,
  QUESTION_SOURCES,
  QUESTION_SOURCE_LABELS,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  STIMULUS_TYPES,
  STIMULUS_TYPE_LABELS,
  UPLOAD_RULES,
  type QuestionStatus,
} from '@/features/content/constants'
import { QuestionInputSchema, emptyQuestionInput, sprAnswerError, type QuestionInputRaw } from '@/features/content/question-schema'
import { issuesToFieldErrors } from '@/features/content/form-errors'
import { duplicateQuestionAction, saveQuestionAction, setQuestionStatusAction } from '@/features/content/question-actions'
import { DIFFICULTY_LABELS, type RevealedAnswer, type SafeQuestion, type SubjectCode } from '@/types/questions'

export type EditorTaxonomy = {
  subjects: Array<{ id: string; code: string; name: string }>
  domains: Array<{ id: string; subjectId: string; name: string }>
  skills: Array<{ id: string; domainId: string; name: string }>
}

export type QuestionMeta = {
  id: string
  status: QuestionStatus
  version: number
  createdAt: string
  updatedAt: string
  reviewedAt: string | null
  publishedAt: string | null
  createdBy: { name: string; email: string } | null
  reviewedBy: { name: string; email: string } | null
  imageUrl: string | null
  isComplete: boolean
  usage: { attempts: number }
}

type Form = {
  subject_id: string
  domain_id: string
  skill_id: string
  difficulty: string
  question_type: string
  stimulus_type: string
  stem: string
  passage: string
  image_path: string
  image_alt: string
  options: string[]
  correct_option: string | null
  spr_answers: string[]
  explanation_en: string
  explanation_uz: string
  explanation_ru: string
  estimated_seconds: string
  tags: string
  source: string
  source_reference: string
}

function toForm(raw: QuestionInputRaw): Form {
  return {
    subject_id: raw.subject_id,
    domain_id: raw.domain_id,
    skill_id: raw.skill_id,
    difficulty: raw.difficulty,
    question_type: raw.question_type,
    stimulus_type: raw.stimulus_type ?? 'text',
    stem: raw.stem,
    passage: raw.passage ?? '',
    image_path: raw.image_path ?? '',
    image_alt: raw.image_alt ?? '',
    options: OPTION_LABELS.map((_, i) => raw.options?.[i]?.content ?? ''),
    correct_option: raw.correct_option ?? null,
    spr_answers: raw.spr_answers?.length ? [...raw.spr_answers] : [''],
    explanation_en: raw.explanation_en,
    explanation_uz: raw.explanation_uz ?? '',
    explanation_ru: raw.explanation_ru ?? '',
    estimated_seconds: String(raw.estimated_seconds ?? 75),
    tags: (raw.tags ?? []).join(', '),
    source: raw.source ?? 'original',
    source_reference: raw.source_reference ?? '',
  }
}

function toInput(f: Form): QuestionInputRaw {
  return {
    subject_id: f.subject_id,
    domain_id: f.domain_id,
    skill_id: f.skill_id,
    difficulty: f.difficulty as QuestionInputRaw['difficulty'],
    question_type: f.question_type as QuestionInputRaw['question_type'],
    stimulus_type: f.stimulus_type as QuestionInputRaw['stimulus_type'],
    stem: f.stem,
    passage: f.passage,
    image_path: f.image_path,
    image_alt: f.image_alt,
    options: f.question_type === 'multiple_choice' ? OPTION_LABELS.map((label, i) => ({ label, content: f.options[i] ?? '' })) : [],
    correct_option: f.question_type === 'multiple_choice' ? ((f.correct_option as QuestionInputRaw['correct_option']) ?? null) : null,
    spr_answers: f.question_type === 'multiple_choice' ? [] : f.spr_answers.map((a) => a.trim()).filter(Boolean),
    explanation_en: f.explanation_en,
    explanation_uz: f.explanation_uz,
    explanation_ru: f.explanation_ru,
    estimated_seconds: f.estimated_seconds,
    tags: f.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    source: f.source as QuestionInputRaw['source'],
    source_reference: f.source_reference,
  }
}

const fmtDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) : '—'

export function QuestionEditor({
  taxonomy,
  initial,
  meta,
  canEdit,
  canPublish,
}: {
  taxonomy: EditorTaxonomy
  initial: QuestionInputRaw | null
  meta: QuestionMeta | null
  canEdit: boolean
  canPublish: boolean
}) {
  const router = useRouter()
  const start0 = React.useMemo(() => toForm(initial ?? emptyQuestionInput()), [initial])
  const [form, setForm] = React.useState<Form>(start0)
  const [saved, setSaved] = React.useState(JSON.stringify(start0))
  const [errors, setErrors] = React.useState<Record<string, string[]>>()
  const [imageUrl, setImageUrl] = React.useState<string | null>(meta?.imageUrl ?? null)
  const [showAnswer, setShowAnswer] = React.useState(false)
  const [previewLocale, setPreviewLocale] = React.useState<'en' | 'uz'>('en')
  const [confirmArchive, setConfirmArchive] = React.useState(false)
  const [pending, start] = React.useTransition()
  const { upload, uploading } = useSignedUpload()
  const dirty = JSON.stringify(form) !== saved
  const status = meta?.status ?? 'draft'
  const isMc = form.question_type === 'multiple_choice'
  const e = (k: string) => errors?.[k]?.[0]
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  React.useEffect(() => {
    if (!dirty) return
    const h = (ev: BeforeUnloadEvent) => ev.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const domains = taxonomy.domains.filter((d) => d.subjectId === form.subject_id)
  const skills = taxonomy.skills.filter((s) => s.domainId === form.domain_id)
  const subject = taxonomy.subjects.find((s) => s.id === form.subject_id)
  const domain = taxonomy.domains.find((d) => d.id === form.domain_id)
  const skill = taxonomy.skills.find((s) => s.id === form.skill_id)

  function save() {
    const input = toInput(form)
    const local = QuestionInputSchema.safeParse(input)
    if (!local.success) {
      const fe = issuesToFieldErrors(local.error.issues)
      setErrors(fe)
      toast.error('Fix the highlighted fields before saving.')
      return
    }
    start(async () => {
      const res = await saveQuestionAction(input, meta?.id)
      if (!res.ok) {
        setErrors(res.fieldErrors)
        toast.error(res.error)
        return
      }
      setErrors(undefined)
      setSaved(JSON.stringify(form))
      toast.success(res.message ?? 'Saved')
      if (!meta) router.replace(`/admin/questions/${res.data!.id}`)
      else router.refresh()
    })
  }

  function changeStatus(next: QuestionStatus) {
    if (!meta) return
    start(async () => {
      const res = await setQuestionStatusAction(meta.id, next)
      if (res.ok) {
        toast.success(res.message ?? 'Saved')
        setConfirmArchive(false)
        router.refresh()
      } else toast.error(res.error)
    })
  }

  function duplicate() {
    if (!meta) return
    start(async () => {
      const res = await duplicateQuestionAction(meta.id)
      if (res.ok) {
        toast.success(res.message ?? 'Duplicated')
        router.push(`/admin/questions/${res.data!.id}`)
      } else toast.error(res.error)
    })
  }

  async function onImage(file: File) {
    const res = await upload('question_image', file)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setForm((f) => ({ ...f, image_path: res.path, stimulus_type: f.stimulus_type === 'text' ? 'image' : f.stimulus_type }))
    setImageUrl(res.previewUrl)
    toast.success('Image uploaded')
  }

  // ---------------------------------------------------------------- preview
  const preview: SafeQuestion = {
    id: meta?.id ?? 'preview',
    subjectCode: (subject?.code ?? 'math') as SubjectCode,
    domainId: form.domain_id,
    domainName: domain?.name ?? '',
    skillId: form.skill_id,
    skillName: skill?.name ?? 'Choose a skill',
    difficulty: (DIFFICULTIES as readonly string[]).includes(form.difficulty) ? (form.difficulty as SafeQuestion['difficulty']) : 'medium',
    questionType: isMc ? 'multiple_choice' : 'student_produced_response',
    stimulusType: form.stimulus_type as SafeQuestion['stimulusType'],
    stem: form.stem || '*The question stem appears here.*',
    passage: form.passage || null,
    imageUrl: form.image_path ? imageUrl : null,
    imageAlt: form.image_alt || null,
    estimatedSeconds: Number(form.estimated_seconds) || 75,
    options: isMc ? OPTION_LABELS.map((label, i) => ({ id: `opt-${label}`, label, content: form.options[i] || `*Option ${label}*` })) : [],
  }
  const acceptedPreview = form.spr_answers.map((a) => a.trim()).filter((a) => a && !sprAnswerError(a))
  const reveal: RevealedAnswer | null = showAnswer
    ? {
        questionId: preview.id,
        isCorrect: true,
        selectedOptionId: isMc && form.correct_option ? `opt-${form.correct_option}` : null,
        responseText: !isMc ? (acceptedPreview[0] ?? null) : null,
        correctOptionId: isMc && form.correct_option ? `opt-${form.correct_option}` : null,
        acceptedAnswers: isMc ? [] : acceptedPreview,
        explanation: (previewLocale === 'uz' ? form.explanation_uz : form.explanation_en) || '*No explanation in this language yet.*',
      }
    : null

  const reviewBlocker = !meta ? 'Save the question first.' : dirty ? 'Save your changes first.' : !meta.isComplete ? 'Add an English explanation and a valid answer key.' : null

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid grid-cols-1 min-w-0 content-start gap-5">
        {meta && (
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <QuestionStatusBadge status={status} />
              <Badge variant="outline">v{meta.version}</Badge>
              {dirty && <Badge variant="warning">Unsaved changes</Badge>}
              {!meta.isComplete && <Badge variant="destructive">Incomplete</Badge>}
              <div className="ml-auto flex flex-wrap gap-2">
                {status === 'draft' && (
                  <Button size="sm" variant="secondary" disabled={Boolean(reviewBlocker) || pending} title={reviewBlocker ?? undefined} onClick={() => changeStatus('reviewed')}>
                    <CheckCircle2 /> Mark reviewed
                  </Button>
                )}
                {canPublish && status === 'reviewed' && (
                  <Button size="sm" disabled={dirty || pending} title={dirty ? 'Save your changes first.' : undefined} onClick={() => changeStatus('published')}>
                    <Send /> Publish
                  </Button>
                )}
                {canPublish && (status === 'published' || status === 'reviewed') && (
                  <Button size="sm" variant="secondary" disabled={pending} onClick={() => changeStatus('draft')}>
                    <RotateCcw /> {status === 'published' ? 'Unpublish to draft' : 'Back to draft'}
                  </Button>
                )}
                {canPublish && status === 'archived' && (
                  <Button size="sm" variant="secondary" disabled={pending} onClick={() => changeStatus('draft')}>
                    <RotateCcw /> Restore to draft
                  </Button>
                )}
                {canEdit && (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={duplicate}>
                    <Copy /> Duplicate
                  </Button>
                )}
                {canPublish && status !== 'archived' && (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmArchive(true)}>
                    <Archive /> Archive
                  </Button>
                )}
              </div>
            </div>
            {status === 'draft' && reviewBlocker && <p className="text-[13px] text-muted-foreground">To mark reviewed: {reviewBlocker}</p>}
            {status === 'reviewed' && !canPublish && <p className="text-[13px] text-muted-foreground">Reviewed. A content editor or admin can publish it.</p>}
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1 border-t border-border pt-3 text-[13px] sm:grid-cols-2">
              <MetaRow label="Created by" value={`${meta.createdBy?.name ?? 'Unknown'} · ${fmtDate(meta.createdAt)}`} />
              <MetaRow label="Reviewed by" value={meta.reviewedBy ? `${meta.reviewedBy.name} · ${fmtDate(meta.reviewedAt)}` : 'Not reviewed yet'} />
              <MetaRow label="Last updated" value={fmtDate(meta.updatedAt)} />
              <MetaRow label="Published" value={meta.publishedAt ? fmtDate(meta.publishedAt) : 'Never'} />
              <MetaRow label="Student answers" value={meta.usage.attempts.toLocaleString('en-US')} />
              <MetaRow label="Version" value={`${meta.version} (increments when stem, passage, difficulty or type change)`} />
            </dl>
          </div>
        )}
        {meta && meta.usage.attempts > 0 && canEdit && (
          <Alert variant="warning" title="Students have answered this question">
            Edits change what future students see. To change the meaning of a question, duplicate it and archive the original.
          </Alert>
        )}

        <fieldset disabled={!canEdit} className="grid grid-cols-1 gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Classification</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField id="q-subject" label="Subject" required error={e('subject_id')}>
                  {(a) => (
                    <NativeSelect {...a} value={form.subject_id} onChange={(ev) => setForm((f) => ({ ...f, subject_id: ev.target.value, domain_id: '', skill_id: '' }))}>
                      <option value="">Choose…</option>
                      {taxonomy.subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </FormField>
                <FormField id="q-domain" label="Domain" required error={e('domain_id')}>
                  {(a) => (
                    <NativeSelect {...a} value={form.domain_id} disabled={!form.subject_id} onChange={(ev) => setForm((f) => ({ ...f, domain_id: ev.target.value, skill_id: '' }))}>
                      <option value="">Choose…</option>
                      {domains.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </FormField>
                <FormField id="q-skill" label="Skill" required error={e('skill_id')}>
                  {(a) => (
                    <NativeSelect {...a} value={form.skill_id} disabled={!form.domain_id} onChange={(ev) => set('skill_id', ev.target.value)}>
                      <option value="">Choose…</option>
                      {skills.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </FormField>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField id="q-difficulty" label="Difficulty" required error={e('difficulty')}>
                  {(a) => (
                    <NativeSelect {...a} value={form.difficulty} onChange={(ev) => set('difficulty', ev.target.value)}>
                      {DIFFICULTIES.map((d) => (
                        <option key={d} value={d}>
                          {DIFFICULTY_LABELS[d]}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </FormField>
                <FormField id="q-type" label="Answer format" required error={e('question_type')}>
                  {(a) => (
                    <NativeSelect {...a} value={form.question_type} onChange={(ev) => set('question_type', ev.target.value)}>
                      {QUESTION_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {QUESTION_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </FormField>
                <FormField id="q-seconds" label="Estimated time (s)" error={e('estimated_seconds')}>
                  {(a) => <Input {...a} type="number" min={10} max={900} value={form.estimated_seconds} onChange={(ev) => set('estimated_seconds', ev.target.value)} />}
                </FormField>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Stimulus and stem</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4">
              <FormField id="q-stimulus" label="Stimulus" error={e('stimulus_type')}>
                {(a) => (
                  <NativeSelect {...a} value={form.stimulus_type} onChange={(ev) => set('stimulus_type', ev.target.value)} className="sm:max-w-xs">
                    {STIMULUS_TYPES.map((s) => (
                      <option key={s} value={s}>
                        {STIMULUS_TYPE_LABELS[s]}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
              {(form.stimulus_type === 'passage' || form.passage) && (
                <FormField id="q-passage" label="Passage" required={form.stimulus_type === 'passage'} error={e('passage')}>
                  {(a) => <Textarea {...a} value={form.passage} maxLength={LIMITS.passage} onChange={(ev) => set('passage', ev.target.value)} className="min-h-40" />}
                </FormField>
              )}
              {(form.stimulus_type === 'image' || form.image_path) && (
                <div className="grid grid-cols-1 gap-2 rounded-md border border-border p-3">
                  <Label htmlFor="q-image-file">Image</Label>
                  {form.image_path ? (
                    <div className="flex items-start gap-3">
                      {imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URL
                        <img src={imageUrl} alt={form.image_alt || 'Uploaded question image'} className="max-h-32 rounded border border-border bg-white object-contain" />
                      ) : (
                        <div className="flex size-20 items-center justify-center rounded border border-border bg-muted">
                          <ImageIcon className="size-5 text-muted-foreground" aria-hidden />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <code className="block truncate text-[12px] text-muted-foreground">{form.image_path}</code>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setForm((f) => ({ ...f, image_path: '', stimulus_type: f.stimulus_type === 'image' ? 'text' : f.stimulus_type }))
                            setImageUrl(null)
                          }}
                        >
                          <Trash2 /> Remove image
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <input
                    id="q-image-file"
                    type="file"
                    accept={Object.keys(UPLOAD_RULES.question_image.types).join(',')}
                    disabled={uploading}
                    className="text-[13px] file:mr-3 file:h-8 file:rounded-md file:border file:border-border-strong file:bg-surface file:px-3 file:text-[13px]"
                    onChange={(ev) => {
                      const f = ev.target.files?.[0]
                      if (f) void onImage(f)
                      ev.target.value = ''
                    }}
                  />
                  <p className="text-[13px] text-muted-foreground">{uploading ? 'Uploading…' : `${UPLOAD_RULES.question_image.label}.`}</p>
                  {e('image_path') && <p className="text-[13px] text-destructive">{e('image_path')}</p>}
                  <FormField id="q-image-alt" label="Alt text" required={Boolean(form.image_path)} description="Describe what the image shows for screen-reader users." error={e('image_alt')}>
                    {(a) => <Input {...a} value={form.image_alt} maxLength={LIMITS.imageAlt} onChange={(ev) => set('image_alt', ev.target.value)} />}
                  </FormField>
                </div>
              )}
              <FormField id="q-stem" label="Stem" required error={e('stem')}>
                {(a) => <Textarea {...a} value={form.stem} maxLength={LIMITS.stem} onChange={(ev) => set('stem', ev.target.value)} className="min-h-28" />}
              </FormField>
              <RichTextHelp />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{isMc ? 'Answer options' : 'Accepted answers'}</CardTitle>
              {!isMc && (
                <p className="text-[13px] text-muted-foreground">
                  Every equivalent form students may type, e.g. 3/4, .75 and 0.75. Up to 5 characters (6 with a minus sign); no mixed numbers.
                </p>
              )}
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3">
              {isMc ? (
                <>
                  <RadioGroup value={form.correct_option ?? ''} onValueChange={(v) => set('correct_option', v)} aria-label="Correct option" className="gap-3">
                    {OPTION_LABELS.map((label, i) => (
                      <div key={label} className="flex items-start gap-3">
                        <div className="flex flex-col items-center gap-1 pt-2.5">
                          <RadioGroupItem value={label} id={`q-correct-${label}`} aria-label={`Option ${label} is correct`} />
                          <span className="text-[11px] text-muted-foreground">correct</span>
                        </div>
                        <FormField id={`q-option-${label}`} label={`Option ${label}`} required error={e(`options.${i}.content`)} className="flex-1">
                          {(a) => (
                            <Textarea
                              {...a}
                              value={form.options[i]}
                              maxLength={LIMITS.option}
                              onChange={(ev) => set('options', form.options.map((o, j) => (j === i ? ev.target.value : o)))}
                              className="min-h-12"
                              rows={2}
                            />
                          )}
                        </FormField>
                      </div>
                    ))}
                  </RadioGroup>
                  {(e('correct_option') || e('options')) && <p className="text-[13px] text-destructive">{e('correct_option') ?? e('options')}</p>}
                </>
              ) : (
                <>
                  {form.spr_answers.map((a, i) => {
                    const problem = a.trim() ? sprAnswerError(a.trim()) : null
                    return (
                      <div key={i} className="flex items-start gap-2">
                        <div className="grid grid-cols-1 flex-1 gap-1">
                          <Input
                            aria-label={`Accepted answer ${i + 1}`}
                            aria-invalid={problem || e(`spr_answers.${i}`) ? true : undefined}
                            value={a}
                            maxLength={7}
                            onChange={(ev) => set('spr_answers', form.spr_answers.map((x, j) => (j === i ? ev.target.value : x)))}
                            className="max-w-48 tabular"
                          />
                          {(problem || e(`spr_answers.${i}`)) && <p className="text-[13px] text-destructive">{problem ?? e(`spr_answers.${i}`)}</p>}
                        </div>
                        <IconButton aria-label={`Remove answer ${i + 1}`} icon={<X />} type="button" onClick={() => set('spr_answers', form.spr_answers.filter((_, j) => j !== i))} />
                      </div>
                    )
                  })}
                  {e('spr_answers') && <p className="text-[13px] text-destructive">{e('spr_answers')}</p>}
                  {form.spr_answers.length < LIMITS.sprAnswers && (
                    <Button type="button" size="sm" variant="ghost" className="justify-self-start" onClick={() => set('spr_answers', [...form.spr_answers, ''])}>
                      <Plus /> Add accepted answer
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Explanations</CardTitle>
              <p className="text-[13px] text-muted-foreground">Shown after the student answers. English is required to publish.</p>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4">
              <FormField id="q-exp-en" label="English" required error={e('explanation_en')}>
                {(a) => <Textarea {...a} value={form.explanation_en} maxLength={LIMITS.explanation} onChange={(ev) => set('explanation_en', ev.target.value)} className="min-h-28" />}
              </FormField>
              <FormField id="q-exp-uz" label="Uzbek (Latin)" description="Optional. Students using Uzbek see this, with English as fallback." error={e('explanation_uz')}>
                {(a) => <Textarea {...a} value={form.explanation_uz} maxLength={LIMITS.explanation} onChange={(ev) => set('explanation_uz', ev.target.value)} className="min-h-20" />}
              </FormField>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tags and source</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField id="q-tags" label="Tags" description="Comma-separated." error={e('tags')} className="sm:col-span-2">
                {(a) => <Input {...a} value={form.tags} onChange={(ev) => set('tags', ev.target.value)} placeholder="linear, word-problem" />}
              </FormField>
              <FormField id="q-source" label="Source" error={e('source')}>
                {(a) => (
                  <NativeSelect {...a} value={form.source} onChange={(ev) => set('source', ev.target.value)}>
                    {QUESTION_SOURCES.map((s) => (
                      <option key={s} value={s}>
                        {QUESTION_SOURCE_LABELS[s]}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
              <FormField id="q-source-ref" label="Source reference" error={e('source_reference')}>
                {(a) => <Input {...a} value={form.source_reference} onChange={(ev) => set('source_reference', ev.target.value)} placeholder="Licence or origin" />}
              </FormField>
            </CardContent>
          </Card>
        </fieldset>

        {canEdit && (
          <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 border-t border-border bg-background/95 px-1 py-3 backdrop-blur">
            <Button onClick={save} loading={pending} disabled={(!dirty && Boolean(meta)) || uploading}>
              <Save /> {meta ? 'Save question' : 'Save draft'}
            </Button>
            <span className="text-[13px] text-muted-foreground">
              {dirty
                ? meta && (status === 'reviewed' || status === 'published')
                  ? `Unsaved changes. Saving keeps the question ${status}.`
                  : 'Unsaved changes.'
                : meta
                  ? 'All changes saved.'
                  : 'New questions are saved as drafts.'}
            </span>
          </div>
        )}
      </div>

      <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start" aria-label="Live preview">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">Student preview</p>
          <div className="ml-auto flex items-center gap-2">
            {showAnswer && (
              <NativeSelect aria-label="Explanation language" value={previewLocale} onChange={(ev) => setPreviewLocale(ev.target.value as 'en' | 'uz')} className="h-8 w-auto text-[13px]">
                <option value="en">English</option>
                <option value="uz">Uzbek</option>
              </NativeSelect>
            )}
            <Button type="button" size="sm" variant="secondary" onClick={() => setShowAnswer((v) => !v)} aria-pressed={showAnswer}>
              {showAnswer ? <EyeOff /> : <Eye />} {showAnswer ? 'Hide answer' : 'Show answer'}
            </Button>
          </div>
        </div>
        <div className="xl:max-h-[calc(100dvh-8rem)] xl:overflow-y-auto">
          <QuestionCard question={preview} reveal={reveal} disabled={false} />
        </div>
        <p className="mt-2 text-[13px] text-muted-foreground">
          {subject?.name ?? 'No subject'} · {domain?.name ?? 'no domain'} · about {Number(form.estimated_seconds) || 75}s
        </p>
      </aside>

      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title="Archive this question?"
        description="It disappears from practice, diagnostics and new exams. Past answers keep their history. You can restore it to draft later."
        confirmLabel="Archive question"
        destructive
        loading={pending}
        onConfirm={() => changeStatus('archived')}
      />
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-muted-foreground">{label}:</dt>
      <dd className="min-w-0 truncate">{value}</dd>
    </div>
  )
}
