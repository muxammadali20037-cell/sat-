'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Download, ExternalLink } from 'lucide-react'
import { useDict } from '@/lib/i18n/client'
import { plural } from '@/lib/i18n/dict'
import { classroomDict } from '@/lib/i18n/dictionaries/classroom'
import type { ActionResult } from '@/lib/api/errors'
import { createBrowserSupabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { ConfirmActionButton } from './forms'
import {
  addLinkMaterialAction,
  archiveMaterialAction,
  cancelSessionAction,
  createMaterialUploadAction,
  createSessionAction,
  finalizeMaterialAction,
  markAttendanceAction,
  materialDownloadAction,
} from '@/features/classroom/lesson-actions'
import { ATTENDANCE_STATUSES, checkMaterialFile, type AttendanceStatus } from '@/features/classroom/lessons'

const field = 'grid grid-cols-1 gap-1.5'

function useRun() {
  const router = useRouter()
  const [pending, start] = React.useTransition()
  const run = <R,>(fn: () => Promise<ActionResult<R>>, onOk?: (r: ActionResult<R> & { ok: true }) => void) =>
    start(async () => {
      const res = await fn()
      if (res.ok) {
        if (res.message) toast.success(res.message)
        onOk?.(res)
        router.refresh()
      } else toast.error(res.error)
    })
  return { pending, run }
}

export function CreateSessionForm({ workspaceId, groupId }: { workspaceId: string; groupId: string }) {
  const c = useDict(classroomDict)
  const t = c.teach.lessons
  const { pending, run } = useRun()
  const [title, setTitle] = React.useState('')
  const [startsAt, setStartsAt] = React.useState('')
  const [duration, setDuration] = React.useState(90)
  const [location, setLocation] = React.useState('')
  const [meetingUrl, setMeetingUrl] = React.useState('')
  const [weeks, setWeeks] = React.useState(1)
  return (
    <form
      className="grid grid-cols-1 gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        run(
          () =>
            createSessionAction({
              workspaceId,
              groupId,
              title,
              startsAt: new Date(startsAt).toISOString(),
              durationMinutes: duration,
              location,
              meetingUrl: meetingUrl.trim() || null,
              repeatWeeks: weeks,
            }),
          () => {
            setTitle('')
            setStartsAt('')
          },
        )
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
        <div className={field}>
          <Label htmlFor="ses-title">{t.name}</Label>
          <Input id="ses-title" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={120} />
        </div>
        <div className={field}>
          <Label htmlFor="ses-start">{t.startsAt}</Label>
          <Input id="ses-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className={field}>
          <Label htmlFor="ses-dur">{t.duration}</Label>
          <Input id="ses-dur" type="number" min={15} max={360} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value) || 60)} />
        </div>
        <div className={field}>
          <Label htmlFor="ses-repeat">{t.repeat}</Label>
          <NativeSelect id="ses-repeat" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
            {[1, 2, 4, 8, 12, 16].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? t.repeatOnce : plural(n, t.repeatN)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className={`${field} col-span-2 sm:col-span-1`}>
          <Label htmlFor="ses-loc">{t.location}</Label>
          <Input id="ses-loc" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} />
        </div>
      </div>
      <div className={field}>
        <Label htmlFor="ses-url">{t.meetingUrl}</Label>
        <Input id="ses-url" type="url" inputMode="url" placeholder="https://" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} maxLength={600} />
        <p className="text-xs text-muted-foreground">{t.meetingHint}</p>
      </div>
      <div>
        <Button type="submit" loading={pending}>
          {t.create}
        </Button>
      </div>
    </form>
  )
}

export function CancelSessionButton({ workspaceId, sessionId }: { workspaceId: string; sessionId: string }) {
  const t = useDict(classroomDict).teach.lessons
  return <ConfirmActionButton label={t.cancel} title={t.cancelTitle} body={t.cancelBody} action={() => cancelSessionAction({ workspaceId, sessionId })} />
}

export function AttendanceForm({
  workspaceId,
  sessionId,
  students,
}: {
  workspaceId: string
  sessionId: string
  students: Array<{ id: string; name: string; status: AttendanceStatus | null; note: string }>
}) {
  const t = useDict(classroomDict).teach.lessons
  const { pending, run } = useRun()
  const [marks, setMarks] = React.useState(() => new Map(students.map((s) => [s.id, { status: s.status, note: s.note }])))
  const setMark = (id: string, patch: Partial<{ status: AttendanceStatus | null; note: string }>) =>
    setMarks((prev) => new Map(prev).set(id, { ...prev.get(id)!, ...patch }))
  if (students.length === 0) return <p className="text-sm text-muted-foreground">{t.noStudents}</p>
  const filled = [...marks.entries()].filter(([, v]) => v.status !== null)
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => markAttendanceAction({ workspaceId, sessionId, marks: filled.map(([studentId, v]) => ({ studentId, status: v.status!, note: v.note })) }))
      }}
    >
      <Button type="button" size="sm" variant="secondary" onClick={() => setMarks(new Map(students.map((s) => [s.id, { status: 'present', note: marks.get(s.id)?.note ?? '' }])))}>
        {t.allPresent}
      </Button>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {students.map((s) => {
          const v = marks.get(s.id)!
          return (
            <li key={s.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" data-student={s.id}>
              <span className="text-sm font-medium text-foreground">{s.name}</span>
              <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={s.name}>
                {ATTENDANCE_STATUSES.map((st) => (
                  <label
                    key={st}
                    className={`cursor-pointer rounded-md border px-2.5 py-1 text-[13px] ${v.status === st ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong text-foreground hover:bg-muted'}`}
                  >
                    <input type="radio" name={`att-${s.id}`} value={st} checked={v.status === st} onChange={() => setMark(s.id, { status: st })} className="sr-only" />
                    {t.attendanceStatuses[st]}
                  </label>
                ))}
                <Input
                  aria-label={`${t.note}: ${s.name}`}
                  placeholder={t.note}
                  value={v.note}
                  onChange={(e) => setMark(s.id, { note: e.target.value })}
                  maxLength={300}
                  className="h-8 w-40"
                />
              </div>
            </li>
          )
        })}
      </ul>
      <Button type="submit" loading={pending} disabled={filled.length === 0}>
        {t.saveAttendance}
      </Button>
    </form>
  )
}

export function AddLinkMaterialForm({ workspaceId, groupId }: { workspaceId: string; groupId: string }) {
  const t = useDict(classroomDict).teach.materials
  const { pending, run } = useRun()
  const [title, setTitle] = React.useState('')
  const [url, setUrl] = React.useState('')
  return (
    <form
      className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => addLinkMaterialAction({ workspaceId, groupId, title, url }), () => {
          setTitle('')
          setUrl('')
        })
      }}
    >
      <div className={field}>
        <Label htmlFor="mat-link-title">{t.itemTitle}</Label>
        <Input id="mat-link-title" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={160} />
      </div>
      <div className={field}>
        <Label htmlFor="mat-link-url">{t.url}</Label>
        <Input id="mat-link-url" type="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} required maxLength={600} />
      </div>
      <Button type="submit" loading={pending}>
        {t.add}
      </Button>
    </form>
  )
}

export function UploadMaterialForm({ workspaceId, groupId }: { workspaceId: string; groupId: string }) {
  const t = useDict(classroomDict).teach.materials
  const router = useRouter()
  const [title, setTitle] = React.useState('')
  const [file, setFile] = React.useState<File | null>(null)
  const [busy, setBusy] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    const problem = checkMaterialFile(file)
    if (problem) return toast.error(problem === 'type' ? t.badType : t.tooBig)
    setBusy(true)
    try {
      const target = await createMaterialUploadAction({ workspaceId, groupId, contentType: file.type, size: file.size })
      if (!target.ok) return toast.error(target.error)
      const { error } = await createBrowserSupabase().storage.from('workspace-files').uploadToSignedUrl(target.data!.path, target.data!.token, file, { contentType: file.type, upsert: false })
      if (error) return toast.error(t.uploadFailed)
      const done = await finalizeMaterialAction({ workspaceId, groupId, path: target.data!.path, title: title || file.name.slice(0, 160), fileName: file.name.slice(0, 200) })
      if (!done.ok) return toast.error(done.error)
      toast.success(done.message ?? t.added)
      setTitle('')
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      router.refresh()
    } catch {
      toast.error(t.uploadFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={submit}>
      <div className={field}>
        <Label htmlFor="mat-file-title">{t.itemTitle}</Label>
        <Input id="mat-file-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
      </div>
      <div className={field}>
        <Label htmlFor="mat-file">{t.file}</Label>
        <Input id="mat-file" ref={inputRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
      </div>
      <Button type="submit" loading={busy} disabled={!file}>
        {t.upload}
      </Button>
      <p className="text-xs text-muted-foreground sm:col-span-3">{t.fileHint}</p>
    </form>
  )
}

export function ArchiveMaterialButton({ materialId }: { materialId: string }) {
  const t = useDict(classroomDict).teach.materials
  const { pending, run } = useRun()
  return (
    <Button type="button" size="sm" variant="ghost" loading={pending} onClick={() => run(() => archiveMaterialAction({ materialId }))}>
      {t.archive}
    </Button>
  )
}

/** Opens a material: a link directly, a file through a fresh short-lived signed URL. */
export function MaterialOpenButton({ materialId, kind, url, label }: { materialId: string; kind: 'file' | 'link'; url: string | null; label: string }) {
  const [busy, setBusy] = React.useState(false)
  if (kind === 'link' && url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
        {label} <ExternalLink className="size-3.5" aria-hidden />
      </a>
    )
  }
  return (
    <button
      type="button"
      disabled={busy}
      className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline disabled:opacity-60"
      onClick={async () => {
        setBusy(true)
        try {
          const res = await materialDownloadAction({ materialId })
          if (res.ok) window.location.assign(res.data!.url)
          else toast.error(res.error)
        } finally {
          setBusy(false)
        }
      }}
    >
      <Download className="size-3.5" aria-hidden /> {label}
    </button>
  )
}
