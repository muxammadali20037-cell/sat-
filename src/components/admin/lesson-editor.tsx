'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ExternalLink, FileText, Link2, Plus, RotateCcw, Save, Send, Trash2, Upload, Video, X } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/controls'
import { FormField, Input, Label, NativeSelect, Textarea } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { RichText } from '@/components/learning/rich-text'
import { ContentStatusBadge } from '@/components/admin/status-badge'
import { RichTextHelp } from '@/components/admin/rich-text-help'
import { useSignedUpload } from '@/components/admin/use-signed-upload'
import { LIMITS, MIN_TEXT_LESSON_BODY, UPLOAD_RULES, VIDEO_PROVIDERS, VIDEO_PROVIDER_LABELS, type ContentStatus } from '@/features/content/constants'
import { slugify, type LessonInputRaw } from '@/features/content/schemas'
import { addLessonFile, addLessonLink, deleteLesson, deleteLessonResource, saveLessonAction, setLessonStatus } from '@/features/content/lesson-actions'
import { getStaffMediaUrl } from '@/features/content/upload-actions'
import { cn } from '@/lib/utils'

type Resource = { id: string; title: string; kind: 'link' | 'file'; url: string | null; storagePath: string | null }

export type LessonEditorProps = {
  lesson: {
    id: string
    status: ContentStatus
    input: LessonInputRaw
    resources: Resource[]
    publishedAt: string | null
    updatedAt: string
    progress: { learners: number; completions: number }
  } | null
  defaults?: Partial<LessonInputRaw>
  courses: Array<{ id: string; title: string; subjectName: string }>
  skills: Array<{ id: string; name: string; group: string }>
  canEdit: boolean
}

type Form = {
  course_id: string
  skill_id: string
  slug: string
  title: string
  description: string
  objectives: string[]
  position: string
  duration_minutes: string
  is_free_preview: boolean
  body: string
  video_provider: (typeof VIDEO_PROVIDERS)[number]
  video_asset_id: string
}

function toForm(input: Partial<LessonInputRaw> | undefined, courses: LessonEditorProps['courses']): Form {
  return {
    course_id: input?.course_id ?? courses[0]?.id ?? '',
    skill_id: input?.skill_id ?? '',
    slug: input?.slug ?? '',
    title: input?.title ?? '',
    description: input?.description ?? '',
    objectives: input?.objectives?.length ? [...input.objectives] : [''],
    position: String(input?.position ?? 0),
    duration_minutes: String(input?.duration_minutes ?? 0),
    is_free_preview: Boolean(input?.is_free_preview),
    body: input?.body ?? '',
    video_provider: input?.video_provider ?? 'none',
    video_asset_id: input?.video_asset_id ?? '',
  }
}

export function LessonEditor({ lesson, defaults, courses, skills, canEdit }: LessonEditorProps) {
  const router = useRouter()
  const initial = React.useMemo(() => toForm(lesson?.input ?? defaults, courses), [lesson, defaults, courses])
  const [form, setForm] = React.useState<Form>(initial)
  const [saved, setSaved] = React.useState(JSON.stringify(initial))
  const [errors, setErrors] = React.useState<Record<string, string[]>>()
  const [slugTouched, setSlugTouched] = React.useState(Boolean(lesson))
  const [pending, start] = React.useTransition()
  const [confirm, setConfirm] = React.useState<null | 'archive' | 'delete'>(null)
  const [videoUrl, setVideoUrl] = React.useState<string | null>(null)
  const { upload, uploading } = useSignedUpload()
  const dirty = JSON.stringify(form) !== saved
  const status = lesson?.status ?? 'draft'
  const e = (k: string) => errors?.[k]?.[0]
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  // Warn before leaving with unsaved changes.
  React.useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (ev: BeforeUnloadEvent) => ev.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  function payload() {
    return { ...form, objectives: form.objectives.map((o) => o.trim()).filter(Boolean), skill_id: form.skill_id }
  }

  function save() {
    start(async () => {
      const res = await saveLessonAction(payload(), lesson?.id)
      if (!res.ok) {
        setErrors(res.fieldErrors)
        toast.error(res.error)
        return
      }
      setErrors(undefined)
      setSaved(JSON.stringify(form))
      toast.success(res.message ?? 'Saved')
      if (!lesson) router.replace(`/admin/lessons/${res.data!.id}`)
      else router.refresh()
    })
  }

  function changeStatus(next: ContentStatus) {
    if (!lesson) return
    start(async () => {
      const res = await setLessonStatus(lesson.id, next)
      if (res.ok) {
        toast.success(res.message ?? 'Saved')
        setConfirm(null)
        router.refresh()
      } else toast.error(res.error)
    })
  }

  const publishBlocker = (() => {
    if (!lesson) return 'Save the lesson first.'
    if (dirty) return 'Save your changes before publishing.'
    if (Number(form.duration_minutes) <= 0) return 'Set a duration greater than 0.'
    if (form.video_provider !== 'none' && !form.video_asset_id) return 'Add the video asset before publishing.'
    if (form.video_provider === 'none' && form.body.trim().length < MIN_TEXT_LESSON_BODY)
      return `Text lessons need at least ${MIN_TEXT_LESSON_BODY} characters of notes.`
    return null
  })()

  async function onVideoFile(file: File) {
    if (!lesson) return
    const res = await upload('lesson_video', file, lesson.id)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    set('video_asset_id', res.path)
    setVideoUrl(null)
    toast.success('Video uploaded. Save the lesson to use it.')
  }

  async function previewVideo() {
    const res = await getStaffMediaUrl({ purpose: 'lesson_video', path: form.video_asset_id })
    if (res.ok) setVideoUrl(res.data!.url)
    else toast.error(res.error)
  }

  const selectedCourse = courses.find((c) => c.id === form.course_id)

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className="grid grid-cols-1 min-w-0 content-start gap-5">
        {lesson && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
            <ContentStatusBadge status={status} />
            {dirty && <Badge variant="warning">Unsaved changes</Badge>}
            <span className="text-[13px] text-muted-foreground">
              {lesson.progress.learners > 0 ? `${lesson.progress.learners} learners · ${lesson.progress.completions} completions` : 'No learner progress yet'}
            </span>
            {canEdit && (
              <div className="ml-auto flex flex-wrap gap-2">
                {status !== 'published' && (
                  <Button size="sm" variant="secondary" disabled={Boolean(publishBlocker) || pending} title={publishBlocker ?? undefined} onClick={() => changeStatus('published')}>
                    <Send /> Publish
                  </Button>
                )}
                {status === 'published' && (
                  <Button size="sm" variant="secondary" disabled={pending} onClick={() => changeStatus('draft')}>
                    <RotateCcw /> Unpublish
                  </Button>
                )}
                {status !== 'archived' ? (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirm('archive')}>
                    <Archive /> Archive
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => changeStatus('draft')}>
                    <RotateCcw /> Restore to draft
                  </Button>
                )}
                {status === 'draft' && lesson.progress.learners === 0 && (
                  <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => setConfirm('delete')}>
                    <Trash2 /> Delete
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
        {lesson && status !== 'published' && publishBlocker && canEdit && <p className="-mt-3 text-[13px] text-muted-foreground">To publish: {publishBlocker}</p>}

        <fieldset disabled={!canEdit} className="grid grid-cols-1 gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4">
              <FormField id="lesson-title" label="Title" required error={e('title')}>
                {(a) => (
                  <Input
                    {...a}
                    value={form.title}
                    maxLength={LIMITS.lessonTitle}
                    onChange={(ev) => setForm((f) => ({ ...f, title: ev.target.value, slug: slugTouched ? f.slug : slugify(ev.target.value) }))}
                  />
                )}
              </FormField>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField id="lesson-course" label="Course" required error={e('course_id')}>
                  {(a) => (
                    <NativeSelect {...a} value={form.course_id} onChange={(ev) => set('course_id', ev.target.value)}>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.subjectName} · {c.title}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </FormField>
                <FormField id="lesson-skill" label="Skill" description="Links the lesson to practice and study plans." error={e('skill_id')}>
                  {(a) => (
                    <NativeSelect {...a} value={form.skill_id} onChange={(ev) => set('skill_id', ev.target.value)}>
                      <option value="">No specific skill</option>
                      {skills.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.group} · {s.name}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </FormField>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField id="lesson-slug" label="Slug" required error={e('slug')} className="sm:col-span-1">
                  {(a) => (
                    <Input
                      {...a}
                      value={form.slug}
                      className="font-mono"
                      onChange={(ev) => {
                        setSlugTouched(true)
                        set('slug', ev.target.value)
                      }}
                    />
                  )}
                </FormField>
                <FormField id="lesson-duration" label="Duration (minutes)" required error={e('duration_minutes')}>
                  {(a) => <Input {...a} type="number" min={0} max={360} step="0.5" value={form.duration_minutes} onChange={(ev) => set('duration_minutes', ev.target.value)} />}
                </FormField>
                <FormField id="lesson-position" label="Position in course" error={e('position')}>
                  {(a) => <Input {...a} type="number" min={0} value={form.position} onChange={(ev) => set('position', ev.target.value)} />}
                </FormField>
              </div>
              <FormField id="lesson-description" label="Description" description="Shown on the course page (public)." error={e('description')}>
                {(a) => <Textarea {...a} value={form.description} maxLength={LIMITS.lessonDescription} onChange={(ev) => set('description', ev.target.value)} className="min-h-20" />}
              </FormField>
              <fieldset className="grid grid-cols-1 gap-2">
                <legend className="mb-1 text-sm font-medium">Objectives</legend>
                {form.objectives.map((o, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      aria-label={`Objective ${i + 1}`}
                      value={o}
                      placeholder="By the end you can…"
                      onChange={(ev) => set('objectives', form.objectives.map((x, j) => (j === i ? ev.target.value : x)))}
                    />
                    <IconButton aria-label={`Remove objective ${i + 1}`} icon={<X />} type="button" onClick={() => set('objectives', form.objectives.filter((_, j) => j !== i))} />
                  </div>
                ))}
                {e('objectives') && <p className="text-[13px] text-destructive">{e('objectives')}</p>}
                {form.objectives.length < LIMITS.objectives && (
                  <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => set('objectives', [...form.objectives, ''])}>
                    <Plus /> Add objective
                  </Button>
                )}
              </fieldset>
              <label className="flex items-start gap-2.5 text-sm">
                <Checkbox checked={form.is_free_preview} onCheckedChange={(v) => set('is_free_preview', v === true)} className="mt-0.5" />
                <span>
                  Free preview
                  <span className="block text-[13px] text-muted-foreground">Students on the free plan can open this lesson.</span>
                </span>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lesson notes</CardTitle>
              <p className="text-[13px] text-muted-foreground">
                Paid content, served only after the entitlement check. {form.body.length.toLocaleString('en-US')} / {LIMITS.lessonBody.toLocaleString('en-US')} characters.
              </p>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-2">
              <FormField id="lesson-body" label="Notes" error={e('body')}>
                {(a) => (
                  <Textarea
                    {...a}
                    value={form.body}
                    onChange={(ev) => set('body', ev.target.value)}
                    className="min-h-64 font-mono text-[13px]"
                    placeholder={'Key idea\n\nTo solve $3x + 7 = 22$, subtract 7 from both sides.\n\n- Isolate the variable\n- Check your answer'}
                  />
                )}
              </FormField>
              <RichTextHelp />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Video</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4">
              <FormField id="lesson-provider" label="Provider" error={e('video_provider')}>
                {(a) => (
                  <NativeSelect
                    {...a}
                    value={form.video_provider}
                    onChange={(ev) => {
                      set('video_provider', ev.target.value as Form['video_provider'])
                      setVideoUrl(null)
                    }}
                  >
                    {VIDEO_PROVIDERS.map((p) => (
                      <option key={p} value={p}>
                        {VIDEO_PROVIDER_LABELS[p]}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
              {form.video_provider === 'bunny' && (
                <FormField id="lesson-asset" label="Bunny Stream video id" required description="The video GUID from your Bunny Stream library." error={e('video_asset_id')}>
                  {(a) => <Input {...a} value={form.video_asset_id} onChange={(ev) => set('video_asset_id', ev.target.value.trim())} className="font-mono" />}
                </FormField>
              )}
              {form.video_provider === 'supabase' && (
                <div className="grid grid-cols-1 gap-2">
                  <Label htmlFor="lesson-video-file">Video file</Label>
                  {form.video_asset_id ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-[13px]">
                      <Video className="size-4 text-muted-foreground" aria-hidden />
                      <code className="min-w-0 flex-1 truncate">{form.video_asset_id}</code>
                      <Button type="button" size="sm" variant="ghost" onClick={previewVideo}>
                        Preview
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => set('video_asset_id', '')}>
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <p className="text-[13px] text-muted-foreground">No video uploaded.</p>
                  )}
                  {lesson ? (
                    <div className="flex items-center gap-2">
                      <input
                        id="lesson-video-file"
                        type="file"
                        accept={Object.keys(UPLOAD_RULES.lesson_video.types).join(',')}
                        disabled={uploading}
                        className="text-[13px] file:mr-3 file:h-8 file:rounded-md file:border file:border-border-strong file:bg-surface file:px-3 file:text-[13px]"
                        onChange={(ev) => {
                          const f = ev.target.files?.[0]
                          if (f) void onVideoFile(f)
                          ev.target.value = ''
                        }}
                      />
                      {uploading && <span className="text-[13px] text-muted-foreground">Uploading…</span>}
                    </div>
                  ) : (
                    <p className="text-[13px] text-muted-foreground">Save the lesson once to enable uploads.</p>
                  )}
                  <p className="text-[13px] text-muted-foreground">{UPLOAD_RULES.lesson_video.label}. Stored in the private lesson-videos bucket; students get short-lived signed URLs.</p>
                  {e('video_asset_id') && <p className="text-[13px] text-destructive">{e('video_asset_id')}</p>}
                  {videoUrl && (
                    <video src={videoUrl} controls className="mt-2 max-h-72 w-full rounded-md border border-border bg-black" />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </fieldset>

        {canEdit && (
          <div className="sticky bottom-0 z-10 -mx-1 flex items-center gap-3 border-t border-border bg-background/95 px-1 py-3 backdrop-blur">
            <Button onClick={save} loading={pending} disabled={!dirty && Boolean(lesson)}>
              <Save /> {lesson ? 'Save lesson' : 'Create lesson'}
            </Button>
            <span className="text-[13px] text-muted-foreground">{dirty ? 'You have unsaved changes.' : lesson ? 'All changes saved.' : ''}</span>
          </div>
        )}

        {lesson && <ResourcesCard lessonId={lesson.id} resources={lesson.resources} canEdit={canEdit} />}
      </div>

      <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start" aria-label="Live preview">
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-2.5">
            <p className="text-[13px] font-medium text-muted-foreground">Preview</p>
            {form.is_free_preview && <Badge variant="primary">Free preview</Badge>}
          </div>
          <div className="max-h-[calc(100dvh-10rem)] overflow-y-auto p-5">
            <p className="text-[13px] text-muted-foreground">{selectedCourse ? `${selectedCourse.subjectName} · ${selectedCourse.title}` : 'No course'}</p>
            <h2 className="mt-1 text-2xl font-semibold">{form.title || 'Untitled lesson'}</h2>
            {form.description && <p className="mt-2 text-[15px] text-muted-foreground">{form.description}</p>}
            {form.objectives.some((o) => o.trim()) && (
              <div className="mt-4">
                <p className="text-sm font-medium">You will learn to</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-[15px]">
                  {form.objectives
                    .filter((o) => o.trim())
                    .map((o, i) => (
                      <li key={i}>{o}</li>
                    ))}
                </ul>
              </div>
            )}
            {form.video_provider !== 'none' && (
              <div className={cn('mt-4 flex aspect-video items-center justify-center rounded-lg border border-border bg-muted text-[13px] text-muted-foreground')}>
                <Video className="mr-2 size-4" aria-hidden />
                {form.video_asset_id ? 'Video attached' : 'No video yet'}
              </div>
            )}
            <div className="reading mt-5 border-t border-border pt-5 text-[16px]">
              {form.body.trim() ? <RichText source={form.body} /> : <p className="text-muted-foreground">Lesson notes appear here as you type.</p>}
            </div>
          </div>
        </div>
      </aside>

      <ConfirmDialog
        open={confirm === 'archive'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Archive this lesson?"
        description="Students will no longer see it. Progress is kept and you can restore it to draft later."
        confirmLabel="Archive lesson"
        destructive
        loading={pending}
        onConfirm={() => changeStatus('archived')}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this draft lesson?"
        description="The lesson, its notes and resources are removed permanently."
        confirmLabel="Delete lesson"
        destructive
        loading={pending}
        onConfirm={() =>
          start(async () => {
            if (!lesson) return
            const res = await deleteLesson(lesson.id)
            if (res.ok) {
              toast.success(res.message ?? 'Deleted')
              router.replace('/admin/lessons')
            } else toast.error(res.error)
          })
        }
      />
    </div>
  )
}

function ResourcesCard({ lessonId, resources, canEdit }: { lessonId: string; resources: Resource[]; canEdit: boolean }) {
  const router = useRouter()
  const [pending, start] = React.useTransition()
  const [link, setLink] = React.useState({ title: '', url: '' })
  const [fileTitle, setFileTitle] = React.useState('')
  const [linkErrors, setLinkErrors] = React.useState<Record<string, string[]>>()
  const { upload, uploading } = useSignedUpload()
  const fileRef = React.useRef<HTMLInputElement>(null)

  function addLink(ev: React.FormEvent) {
    ev.preventDefault()
    start(async () => {
      const res = await addLessonLink({ lesson_id: lessonId, ...link })
      if (res.ok) {
        toast.success(res.message ?? 'Added')
        setLink({ title: '', url: '' })
        setLinkErrors(undefined)
        router.refresh()
      } else {
        setLinkErrors(res.fieldErrors)
        toast.error(res.error)
      }
    })
  }

  async function addFile() {
    const file = fileRef.current?.files?.[0]
    if (!file) {
      toast.error('Choose a file first.')
      return
    }
    const title = fileTitle.trim() || file.name.replace(/\.[^.]+$/, '')
    const up = await upload('lesson_resource', file, lessonId)
    if (!up.ok) {
      toast.error(up.error)
      return
    }
    const res = await addLessonFile({ lesson_id: lessonId, title, path: up.path })
    if (res.ok) {
      toast.success(res.message ?? 'Added')
      setFileTitle('')
      if (fileRef.current) fileRef.current.value = ''
      router.refresh()
    } else toast.error(res.error)
  }

  async function openFile(path: string) {
    const res = await getStaffMediaUrl({ purpose: 'lesson_resource', path })
    if (res.ok) window.open(res.data!.url, '_blank', 'noopener,noreferrer')
    else toast.error(res.error)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resources</CardTitle>
        <p className="text-[13px] text-muted-foreground">Worksheets and links shown under the lesson. Changes save immediately.</p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4">
        {resources.length === 0 ? (
          <p className="text-sm text-muted-foreground">No resources yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {resources.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                {r.kind === 'link' ? <Link2 className="size-4 text-muted-foreground" aria-hidden /> : <FileText className="size-4 text-muted-foreground" aria-hidden />}
                <span className="min-w-0 flex-1 truncate">{r.title}</span>
                {r.kind === 'link' && r.url ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] text-primary hover:underline">
                    Open <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                ) : r.storagePath ? (
                  <button type="button" onClick={() => void openFile(r.storagePath!)} className="text-[13px] text-primary hover:underline">
                    Open
                  </button>
                ) : null}
                {canEdit && (
                  <IconButton
                    aria-label={`Remove ${r.title}`}
                    icon={<Trash2 />}
                    size="icon-sm"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const res = await deleteLessonResource(r.id)
                        if (res.ok) {
                          toast.success(res.message ?? 'Removed')
                          router.refresh()
                        } else toast.error(res.error)
                      })
                    }
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <form onSubmit={addLink} className="grid grid-cols-1 gap-2 rounded-md border border-border p-3">
              <p className="text-sm font-medium">Add a link</p>
              <FormField id="res-link-title" label="Title" error={linkErrors?.title?.[0]}>
                {(a) => <Input {...a} value={link.title} onChange={(ev) => setLink({ ...link, title: ev.target.value })} className="h-9" />}
              </FormField>
              <FormField id="res-link-url" label="URL (https://)" error={linkErrors?.url?.[0]}>
                {(a) => <Input {...a} type="url" value={link.url} onChange={(ev) => setLink({ ...link, url: ev.target.value })} className="h-9" />}
              </FormField>
              <Button type="submit" size="sm" variant="secondary" loading={pending} className="justify-self-start">
                <Link2 /> Add link
              </Button>
            </form>
            <div className="grid grid-cols-1 gap-2 rounded-md border border-border p-3">
              <p className="text-sm font-medium">Upload a file</p>
              <FormField id="res-file-title" label="Title" description="Defaults to the file name.">
                {(a) => <Input {...a} value={fileTitle} onChange={(ev) => setFileTitle(ev.target.value)} className="h-9" />}
              </FormField>
              <input
                ref={fileRef}
                type="file"
                aria-label="Resource file"
                accept={Object.keys(UPLOAD_RULES.lesson_resource.types).join(',')}
                className="text-[13px] file:mr-3 file:h-8 file:rounded-md file:border file:border-border-strong file:bg-surface file:px-3 file:text-[13px]"
              />
              <p className="text-[13px] text-muted-foreground">{UPLOAD_RULES.lesson_resource.label}</p>
              <Button type="button" size="sm" variant="secondary" loading={uploading} onClick={() => void addFile()} className="justify-self-start">
                <Upload /> Upload file
              </Button>
            </div>
          </div>
        )}
        {!canEdit && <Alert>Only content editors and admins can change resources.</Alert>}
      </CardContent>
    </Card>
  )
}
