'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FormField, Input, NativeSelect, Textarea } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { CONTENT_STATUSES, CONTENT_STATUS_LABELS, COURSE_LEVELS, COURSE_LEVEL_LABELS } from '@/features/content/constants'
import { slugify } from '@/features/content/schemas'
import { deleteCourse, saveCourse } from '@/features/content/curriculum-actions'

export type CourseValue = {
  id?: string
  subject_id: string
  slug: string
  title: string
  description: string
  level: string
  status: string
  position: number
}

export function CourseDialogButton({ subjects, course }: { subjects: Array<{ id: string; name: string }>; course?: CourseValue }) {
  const editing = Boolean(course?.id)
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, start] = React.useTransition()
  const [errors, setErrors] = React.useState<Record<string, string[]>>()
  const initial = {
    subject_id: course?.subject_id ?? subjects[0]?.id ?? '',
    slug: course?.slug ?? '',
    title: course?.title ?? '',
    description: course?.description ?? '',
    level: course?.level ?? 'all',
    status: course?.status ?? 'draft',
    position: String(course?.position ?? 0),
  }
  const [form, setForm] = React.useState(initial)
  const [slugTouched, setSlugTouched] = React.useState(editing)
  const e = (k: string) => errors?.[k]?.[0]

  function submit(ev: React.FormEvent) {
    ev.preventDefault()
    start(async () => {
      const res = await saveCourse(form, course?.id)
      if (res.ok) {
        toast.success(res.message ?? 'Saved')
        setErrors(undefined)
        setOpen(false)
        router.refresh()
      } else {
        setErrors(res.fieldErrors)
        toast.error(res.error)
      }
    })
  }

  return (
    <>
      {editing ? (
        <IconButton aria-label={`Edit ${course!.title}`} icon={<Pencil />} size="icon-sm" onClick={() => setOpen(true)} />
      ) : (
        <Button onClick={() => { setForm(initial); setSlugTouched(false); setOpen(true) }}>
          <Plus /> New course
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit course' : 'New course'}</DialogTitle>
            <DialogDescription>Published courses are visible to everyone; their lessons need their own publishing.</DialogDescription>
          </DialogHeader>
          <form className="grid grid-cols-1 gap-4" onSubmit={submit}>
            <FormField id="course-title" label="Title" required error={e('title')}>
              {(a) => (
                <Input
                  {...a}
                  value={form.title}
                  onChange={(ev) => setForm({ ...form, title: ev.target.value, slug: slugTouched ? form.slug : slugify(ev.target.value) })}
                />
              )}
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField id="course-slug" label="Slug" required description="Used in URLs" error={e('slug')}>
                {(a) => (
                  <Input
                    {...a}
                    value={form.slug}
                    onChange={(ev) => {
                      setSlugTouched(true)
                      setForm({ ...form, slug: ev.target.value })
                    }}
                    className="font-mono"
                  />
                )}
              </FormField>
              <FormField id="course-subject" label="Subject" required error={e('subject_id')}>
                {(a) => (
                  <NativeSelect {...a} value={form.subject_id} onChange={(ev) => setForm({ ...form, subject_id: ev.target.value })}>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
            </div>
            <FormField id="course-description" label="Description" error={e('description')}>
              {(a) => <Textarea {...a} value={form.description} onChange={(ev) => setForm({ ...form, description: ev.target.value })} />}
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField id="course-level" label="Level" error={e('level')}>
                {(a) => (
                  <NativeSelect {...a} value={form.level} onChange={(ev) => setForm({ ...form, level: ev.target.value })}>
                    {COURSE_LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {COURSE_LEVEL_LABELS[l]}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
              <FormField id="course-status" label="Status" error={e('status')}>
                {(a) => (
                  <NativeSelect {...a} value={form.status} onChange={(ev) => setForm({ ...form, status: ev.target.value })}>
                    {CONTENT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {CONTENT_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
              <FormField id="course-position" label="Position" error={e('position')}>
                {(a) => <Input {...a} type="number" min={0} value={form.position} onChange={(ev) => setForm({ ...form, position: ev.target.value })} />}
              </FormField>
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                {editing ? 'Save course' : 'Create course'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function DeleteCourseButton({ id, title, lessonCount }: { id: string; title: string; lessonCount: number }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, start] = React.useTransition()
  return (
    <>
      <IconButton
        aria-label={lessonCount > 0 ? `${title} has lessons and cannot be deleted` : `Delete ${title}`}
        title={lessonCount > 0 ? 'Has lessons — archive instead' : undefined}
        icon={<Trash2 />}
        size="icon-sm"
        disabled={lessonCount > 0}
        onClick={() => setOpen(true)}
      />
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete "${title}"?`}
        description="The course has no lessons. This cannot be undone."
        confirmLabel="Delete course"
        destructive
        loading={pending}
        onConfirm={() =>
          start(async () => {
            const res = await deleteCourse(id)
            if (res.ok) {
              toast.success(res.message ?? 'Deleted')
              setOpen(false)
              router.refresh()
            } else toast.error(res.error)
          })
        }
      />
    </>
  )
}
