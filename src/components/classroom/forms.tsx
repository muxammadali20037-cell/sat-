'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Copy } from 'lucide-react'
import { useDict } from '@/lib/i18n/client'
import { format, plural } from '@/lib/i18n/dict'
import { classroomDict } from '@/lib/i18n/dictionaries/classroom'
import { practiceDict } from '@/lib/i18n/dictionaries/practice'
import type { ActionResult } from '@/lib/api/errors'
import { Button } from '@/components/ui/button'
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { formatCode } from '@/features/classroom/codes'
import {
  archiveGroupAction,
  closeAssignmentAction,
  createAssignmentAction,
  createGroupAction,
  createInvitationAction,
  createWorkspaceAction,
  gradeSubmissionAction,
  joinWithCodeAction,
  removeMemberAction,
  removeStudentAction,
  revokeInvitationAction,
  setProgressSharingAction,
  startAssignmentAction,
  submitTextAction,
} from '@/features/classroom/actions'

function useAction() {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const run = <R,>(fn: () => Promise<ActionResult<R>>, onOk?: (r: ActionResult<R> & { ok: true }) => void) =>
    startTransition(async () => {
      const res = await fn()
      if (res.ok) {
        if (res.message) toast.success(res.message)
        onOk?.(res)
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  return { pending, run, router }
}

const field = 'grid grid-cols-1 gap-1.5'

// ---------------------------------------------------------------------------
// Workspaces, groups
// ---------------------------------------------------------------------------

export function CreateWorkspaceForm() {
  const t = useDict(classroomDict).teach.home
  const { pending, run, router } = useAction()
  const [name, setName] = React.useState('')
  const [kind, setKind] = React.useState<'individual' | 'center'>('individual')
  return (
    <form
      className="grid grid-cols-1 gap-4 sm:max-w-md"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => createWorkspaceAction({ name, kind }), (r) => r.data && router.push(`/teach/${r.data.id}`))
      }}
    >
      <div className={field}>
        <Label htmlFor="ws-name">{t.name}</Label>
        <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t.namePlaceholder} required minLength={2} maxLength={80} />
      </div>
      <div className={field}>
        <Label htmlFor="ws-kind">{t.kind}</Label>
        <NativeSelect id="ws-kind" value={kind} onChange={(e) => setKind(e.target.value as 'individual' | 'center')}>
          <option value="individual">{t.kinds.individual}</option>
          <option value="center">{t.kinds.center}</option>
        </NativeSelect>
      </div>
      <div>
        <Button type="submit" loading={pending}>
          {t.create}
        </Button>
      </div>
    </form>
  )
}

export function CreateGroupForm({ workspaceId }: { workspaceId: string }) {
  const t = useDict(classroomDict).teach.overview
  const { pending, run, router } = useAction()
  const [name, setName] = React.useState('')
  const [subject, setSubject] = React.useState('')
  return (
    <form
      className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => createGroupAction({ workspaceId, name, subject }), (r) => r.data && router.push(`/teach/${workspaceId}/groups/${r.data.id}`))
      }}
    >
      <div className={field}>
        <Label htmlFor="group-name">{t.groupName}</Label>
        <Input id="group-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t.groupNamePlaceholder} required minLength={2} maxLength={80} />
      </div>
      <div className={field}>
        <Label htmlFor="group-subject">{t.subject}</Label>
        <Input id="group-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t.subjectPlaceholder} maxLength={60} />
      </div>
      <Button type="submit" loading={pending}>
        {t.createGroup}
      </Button>
    </form>
  )
}

export function ConfirmActionButton({
  label,
  title,
  body,
  action,
  variant = 'ghost',
  onDone,
}: {
  label: string
  title: string
  body: string
  action: () => Promise<ActionResult>
  variant?: 'ghost' | 'secondary' | 'destructive'
  onDone?: () => void
}) {
  const { pending, run } = useAction()
  const cancel = useDict(classroomDict).cancel
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button type="button" size="sm" variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={body}
        confirmLabel={label}
        cancelLabel={cancel}
        loading={pending}
        onConfirm={() =>
          run(action, () => {
            setOpen(false)
            onDone?.()
          })
        }
      />
    </>
  )
}

export function ArchiveGroupButton({ workspaceId, groupId }: { workspaceId: string; groupId: string }) {
  const t = useDict(classroomDict).teach.group
  const router = useRouter()
  return (
    <ConfirmActionButton
      label={t.archive}
      title={t.archiveTitle}
      body={t.archiveBody}
      variant="secondary"
      action={() => archiveGroupAction({ workspaceId, groupId })}
      onDone={() => router.push(`/teach/${workspaceId}`)}
    />
  )
}

export function RemoveStudentButton({ workspaceId, groupId, studentId, name }: { workspaceId: string; groupId: string; studentId: string; name: string }) {
  const t = useDict(classroomDict).teach.group
  return <ConfirmActionButton label={t.remove} title={format(t.removeTitle, { name })} body={t.removeBody} action={() => removeStudentAction({ workspaceId, groupId, studentId })} />
}

export function RemoveMemberButton({ workspaceId, userId, name }: { workspaceId: string; userId: string; name: string }) {
  const t = useDict(classroomDict).teach.team
  return <ConfirmActionButton label={t.remove} title={format(t.removeTitle, { name })} body={t.removeBody} action={() => removeMemberAction({ workspaceId, userId })} />
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export type InvitationView = { id: string; code: string; link: string; qr: string; role: string; uses: number; maxUses: number | null; expires: string }

export function InvitationList({ workspaceId, items }: { workspaceId: string; items: InvitationView[] }) {
  const c = useDict(classroomDict)
  const t = c.teach.invite
  const { run } = useAction()
  if (items.length === 0) return <p className="text-[13px] text-muted-foreground">{t.none}</p>
  return (
    <ul className="grid grid-cols-1 gap-3">
      {items.map((inv) => (
        <li key={inv.id} className="flex flex-col gap-4 rounded-lg border border-border p-4 sm:flex-row sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URL generated on the server */}
          <img src={inv.qr} alt={t.qrAlt} width={112} height={112} className="size-28 shrink-0 rounded-md border border-border bg-white p-1" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-xs text-muted-foreground">
              {t.code} · {c.roles[inv.role as keyof typeof c.roles]}
            </p>
            <p className="font-mono text-2xl font-semibold tracking-wider text-foreground">{formatCode(inv.code)}</p>
            <p className="truncate text-xs text-muted-foreground" title={inv.link}>
              {inv.link}
            </p>
            <p className="text-xs text-muted-foreground">
              {format(t.expires, { date: inv.expires })} ·{' '}
              {inv.maxUses ? format(t.joinedOf, { uses: inv.uses, max: inv.maxUses }) : format(t.joinedCount, { uses: inv.uses })}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(inv.link).then(() => toast.success(t.copied))
              }}
            >
              <Copy aria-hidden /> {t.copy}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => run(() => revokeInvitationAction({ workspaceId, invitationId: inv.id }))}>
              {t.revoke}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function CreateInvitationForm({ workspaceId, groupId, roles }: { workspaceId: string; groupId: string | null; roles: Array<'admin' | 'teacher' | 'assistant' | 'student'> }) {
  const c = useDict(classroomDict)
  const t = c.teach.invite
  const { pending, run } = useAction()
  const [days, setDays] = React.useState(14)
  const [maxUses, setMaxUses] = React.useState<number | null>(null)
  const [role, setRole] = React.useState(roles[0] ?? 'student')
  return (
    <form
      className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => createInvitationAction({ workspaceId, groupId, role, days, maxUses }))
      }}
    >
      {roles.length > 1 && (
        <div className={field}>
          <Label htmlFor="inv-role">{t.roleLabel}</Label>
          <NativeSelect id="inv-role" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {c.roles[r]}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      <div className={field}>
        <Label htmlFor="inv-days">{t.validity}</Label>
        <NativeSelect id="inv-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[1, 7, 14, 30, 60].map((d) => (
            <option key={d} value={d}>
              {plural(d, t.days)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className={field}>
        <Label htmlFor="inv-max">{t.maxUses}</Label>
        <NativeSelect id="inv-max" value={maxUses ?? ''} onChange={(e) => setMaxUses(e.target.value ? Number(e.target.value) : null)}>
          <option value="">{t.unlimited}</option>
          {[1, 5, 10, 20, 30, 50, 100].map((n) => (
            <option key={n} value={n}>
              {plural(n, t.uses)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button type="submit" loading={pending}>
        {t.create}
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

export type AssignmentFormOptions = {
  domains: Array<{ id: string; name: string; subjectCode: 'math' | 'reading_writing' }>
  mockExams: Array<{ id: string; title: string }>
}

export function CreateAssignmentForm({ workspaceId, groupId, options }: { workspaceId: string; groupId: string; options: AssignmentFormOptions }) {
  const c = useDict(classroomDict)
  const p = useDict(practiceDict)
  const t = c.teach.assignment
  const { pending, run } = useAction()
  const [title, setTitle] = React.useState('')
  const [instructions, setInstructions] = React.useState('')
  const [kind, setKind] = React.useState<'practice' | 'mock_exam' | 'text'>('practice')
  const [subjectCode, setSubject] = React.useState<'math' | 'reading_writing'>('math')
  const [domainId, setDomain] = React.useState('')
  const [difficulty, setDifficulty] = React.useState<'easy' | 'medium' | 'hard' | 'mixed'>('mixed')
  const [count, setCount] = React.useState(10)
  const [timed, setTimed] = React.useState(false)
  const [mockExamId, setMock] = React.useState(options.mockExams[0]?.id ?? '')
  const [due, setDue] = React.useState('')
  const [points, setPoints] = React.useState('')

  const reset = () => {
    setTitle('')
    setInstructions('')
    setDue('')
    setPoints('')
  }

  return (
    <form
      className="grid grid-cols-1 gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        run(
          () =>
            createAssignmentAction({
              workspaceId,
              groupId,
              title,
              instructions,
              kind,
              practice: kind === 'practice' ? { subjectCode, domainId: domainId || null, difficulty, count, timed } : null,
              mockExamId: kind === 'mock_exam' ? mockExamId || null : null,
              dueAt: due ? new Date(due).toISOString() : null,
              points: kind !== 'mock_exam' && points ? Number(points) : null,
            }),
          reset,
        )
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
        <div className={field}>
          <Label htmlFor="asg-title">{t.name}</Label>
          <Input id="asg-title" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={120} />
        </div>
        <div className={field}>
          <Label htmlFor="asg-kind">{t.kind}</Label>
          <NativeSelect id="asg-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            {(['practice', 'mock_exam', 'text'] as const).map((k) => (
              <option key={k} value={k}>
                {c.kinds[k]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">{t.kindHints[kind]}</p>

      {kind === 'practice' && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className={field}>
            <Label htmlFor="asg-subject">{t.subject}</Label>
            <NativeSelect
              id="asg-subject"
              value={subjectCode}
              onChange={(e) => {
                setSubject(e.target.value as typeof subjectCode)
                setDomain('')
              }}
            >
              <option value="math">{p.subjects.math}</option>
              <option value="reading_writing">{p.subjects.reading_writing}</option>
            </NativeSelect>
          </div>
          <div className={field}>
            <Label htmlFor="asg-domain">{t.domain}</Label>
            <NativeSelect id="asg-domain" value={domainId} onChange={(e) => setDomain(e.target.value)}>
              <option value="">{t.anyDomain}</option>
              {options.domains
                .filter((d) => d.subjectCode === subjectCode)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </NativeSelect>
          </div>
          <div className={field}>
            <Label htmlFor="asg-diff">{t.difficulty}</Label>
            <NativeSelect id="asg-diff" value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}>
              {(['mixed', 'easy', 'medium', 'hard'] as const).map((d) => (
                <option key={d} value={d}>
                  {p.difficulty[d]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className={field}>
            <Label htmlFor="asg-count">{t.count}</Label>
            <NativeSelect id="asg-count" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[5, 10, 15, 20, 30, 40, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </NativeSelect>
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm sm:col-span-4">
            <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} className="size-4 accent-[var(--primary)]" />
            {t.timed}
          </label>
        </div>
      )}

      {kind === 'mock_exam' &&
        (options.mockExams.length === 0 ? (
          <p className="text-sm text-warning-foreground">{t.noMocks}</p>
        ) : (
          <div className={field}>
            <Label htmlFor="asg-mock">{t.mockExam}</Label>
            <NativeSelect id="asg-mock" value={mockExamId} onChange={(e) => setMock(e.target.value)}>
              {options.mockExams.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </NativeSelect>
          </div>
        ))}

      <div className={field}>
        <Label htmlFor="asg-instr">{t.instructions}</Label>
        <Textarea id="asg-instr" value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={5000} rows={3} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className={field}>
          <Label htmlFor="asg-due">{t.dueAt}</Label>
          <Input id="asg-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        {kind !== 'mock_exam' && (
          <div className={field}>
            <Label htmlFor="asg-points">{t.points}</Label>
            <Input id="asg-points" type="number" min={1} max={1000} value={points} onChange={(e) => setPoints(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t.pointsHint}</p>
          </div>
        )}
      </div>

      <div>
        <Button type="submit" loading={pending} disabled={kind === 'mock_exam' && options.mockExams.length === 0}>
          {t.create}
        </Button>
      </div>
    </form>
  )
}

export function CloseAssignmentButton({ workspaceId, assignmentId }: { workspaceId: string; assignmentId: string }) {
  const t = useDict(classroomDict).teach.assignment
  const { pending, run } = useAction()
  return (
    <Button type="button" size="sm" variant="secondary" loading={pending} onClick={() => run(() => closeAssignmentAction({ workspaceId, assignmentId }))}>
      {t.close}
    </Button>
  )
}

export function GradeForm({
  workspaceId,
  assignmentId,
  studentId,
  max,
  initial,
}: {
  workspaceId: string
  assignmentId: string
  studentId: string
  max: number
  initial: { score: number | null; feedback: string | null }
}) {
  const t = useDict(classroomDict).teach.assignment
  const { pending, run } = useAction()
  const [score, setScore] = React.useState(initial.score?.toString() ?? '')
  const [feedback, setFeedback] = React.useState(initial.feedback ?? '')
  return (
    <form
      className="grid grid-cols-1 gap-2 sm:grid-cols-[8rem_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => gradeSubmissionAction({ workspaceId, assignmentId, studentId, score: Number(score), feedback }))
      }}
    >
      <div className={field}>
        <Label htmlFor={`score-${studentId}`}>
          {t.score} (0–{max})
        </Label>
        <Input id={`score-${studentId}`} type="number" min={0} max={max} step="0.5" value={score} onChange={(e) => setScore(e.target.value)} required />
      </div>
      <div className={field}>
        <Label htmlFor={`fb-${studentId}`}>{t.feedback}</Label>
        <Input id={`fb-${studentId}`} value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={5000} />
      </div>
      <Button type="submit" size="sm" loading={pending}>
        {t.save}
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Student side
// ---------------------------------------------------------------------------

export function JoinForm({ initialCode = '', redirect = false }: { initialCode?: string; redirect?: boolean }) {
  const t = useDict(classroomDict).classes
  const { pending, run, router } = useAction()
  const [code, setCode] = React.useState(initialCode)
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault()
        run(
          () => joinWithCodeAction({ code }),
          (r) => {
            setCode('')
            if (redirect && r.data) router.push(r.data.staff ? `/teach/${r.data.workspaceId}` : '/dashboard/classes')
          },
        )
      }}
    >
      <div className={`${field} sm:w-56`}>
        <Label htmlFor="join-code">{t.code}</Label>
        <Input
          id="join-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABCD-EF23"
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={12}
          className="font-mono tracking-wider"
          required
        />
      </div>
      <Button type="submit" loading={pending}>
        {t.join}
      </Button>
    </form>
  )
}

export function SharingToggle({ workspaceId, enabled }: { workspaceId: string; enabled: boolean }) {
  const t = useDict(classroomDict).classes
  const { pending, run } = useAction()
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={enabled}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked
          run(() => setProgressSharingAction({ workspaceId, enabled: next }))
        }}
        className="mt-0.5 size-4 accent-[var(--primary)]"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{t.sharing}</span>
        <span className="block text-xs text-muted-foreground">{t.sharingHint}</span>
      </span>
    </label>
  )
}

export function StartAssignmentButton({ assignmentId, label }: { assignmentId: string; label: string }) {
  const { pending, run, router } = useAction()
  return (
    <Button type="button" loading={pending} onClick={() => run(() => startAssignmentAction({ assignmentId }), (r) => r.data?.attemptId && router.push(`/dashboard/practice/${r.data.attemptId}`))}>
      {label}
    </Button>
  )
}

export function TextSubmissionForm({ assignmentId, initial, disabled }: { assignmentId: string; initial: string; disabled: boolean }) {
  const t = useDict(classroomDict).classes
  const { pending, run } = useAction()
  const [text, setText] = React.useState(initial)
  return (
    <form
      className="grid grid-cols-1 gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => submitTextAction({ assignmentId, text }))
      }}
    >
      <Label htmlFor="answer">{t.yourAnswer}</Label>
      <Textarea id="answer" value={text} onChange={(e) => setText(e.target.value)} disabled={disabled} rows={8} maxLength={10000} />
      {!disabled && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={pending} disabled={!text.trim()}>
            {t.submit}
          </Button>
          <p className="text-xs text-muted-foreground">{t.editNote}</p>
        </div>
      )}
    </form>
  )
}
