'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FormField, Input, NativeSelect, Textarea } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import type { ActionResult } from '@/lib/api/errors'
import { createDomain, createSkill, deleteDomain, deleteSkill, updateDomain, updateSkill, updateSubject } from '@/features/content/curriculum-actions'

type FieldErrors = Record<string, string[]> | undefined

/** Runs an action, toasts the result, refreshes server data. Returns field errors for the form. */
function useAction() {
  const router = useRouter()
  const [pending, start] = React.useTransition()
  const [errors, setErrors] = React.useState<FieldErrors>()
  const run = React.useCallback(
    (fn: () => Promise<ActionResult<unknown>>, onDone?: () => void) => {
      start(async () => {
        const res = await fn()
        if (res.ok) {
          setErrors(undefined)
          toast.success(res.message ?? 'Saved')
          onDone?.()
          router.refresh()
        } else {
          setErrors(res.fieldErrors)
          toast.error(res.error)
        }
      })
    },
    [router],
  )
  return { pending, errors, setErrors, run }
}

function err(errors: FieldErrors, key: string) {
  return errors?.[key]?.[0]
}

// ---------------------------------------------------------------------------
// Subjects (codes fixed)
// ---------------------------------------------------------------------------

export function SubjectEditButton({ subject }: { subject: { id: string; code: string; name: string; description: string; position: number } }) {
  const [open, setOpen] = React.useState(false)
  const { pending, errors, run } = useAction()
  const [form, setForm] = React.useState({ name: subject.name, description: subject.description, position: String(subject.position) })
  return (
    <>
      <IconButton aria-label={`Edit ${subject.name}`} icon={<Pencil />} size="icon-sm" onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit subject</DialogTitle>
            <DialogDescription>
              Code <code>{subject.code}</code> is fixed: the platform relies on it for scoring sections.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid grid-cols-1 gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              run(() => updateSubject({ id: subject.id, ...form }), () => setOpen(false))
            }}
          >
            <FormField id="subject-name" label="Name" required error={err(errors, 'name')}>
              {(a) => <Input {...a} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
            </FormField>
            <FormField id="subject-description" label="Description" error={err(errors, 'description')}>
              {(a) => <Textarea {...a} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}
            </FormField>
            <FormField id="subject-position" label="Position" description="Lower numbers are listed first." error={err(errors, 'position')}>
              {(a) => <Input {...a} type="number" min={0} value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} className="w-28" />}
            </FormField>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                Save subject
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

type DomainValue = { id?: string; subject_id: string; code: string; name: string; description: string; weight_percent: number; position: number }

export function DomainDialogButton({ subjects, domain }: { subjects: Array<{ id: string; name: string }>; domain?: DomainValue }) {
  const editing = Boolean(domain?.id)
  const [open, setOpen] = React.useState(false)
  const { pending, errors, run } = useAction()
  const initial = {
    subject_id: domain?.subject_id ?? subjects[0]?.id ?? '',
    code: domain?.code ?? '',
    name: domain?.name ?? '',
    description: domain?.description ?? '',
    weight_percent: String(domain?.weight_percent ?? 25),
    position: String(domain?.position ?? 0),
  }
  const [form, setForm] = React.useState(initial)
  const set = (k: keyof typeof initial) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value })

  return (
    <>
      {editing ? (
        <IconButton aria-label={`Edit ${domain!.name}`} icon={<Pencil />} size="icon-sm" onClick={() => setOpen(true)} />
      ) : (
        <Button onClick={() => { setForm(initial); setOpen(true) }}>
          <Plus /> New domain
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit domain' : 'New domain'}</DialogTitle>
            <DialogDescription>
              {editing ? 'The code and subject cannot change after creation (questions and results reference them).' : 'Codes cannot be changed later.'}
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid grid-cols-1 gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              const payload = { name: form.name, description: form.description, weight_percent: form.weight_percent, position: form.position }
              run(
                () => (editing ? updateDomain({ id: domain!.id, ...payload }) : createDomain({ ...payload, subject_id: form.subject_id, code: form.code })),
                () => setOpen(false),
              )
            }}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField id="domain-subject" label="Subject" required error={err(errors, 'subject_id')}>
                {(a) => (
                  <NativeSelect {...a} value={form.subject_id} onChange={set('subject_id')} disabled={editing}>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
              <FormField id="domain-code" label="Code" required description={editing ? undefined : 'e.g. advanced_math'} error={err(errors, 'code')}>
                {(a) => <Input {...a} value={form.code} onChange={set('code')} disabled={editing} pattern="[a-z0-9_]{2,64}" className="font-mono" />}
              </FormField>
            </div>
            <FormField id="domain-name" label="Name" required error={err(errors, 'name')}>
              {(a) => <Input {...a} value={form.name} onChange={set('name')} />}
            </FormField>
            <FormField id="domain-description" label="Description" error={err(errors, 'description')}>
              {(a) => <Textarea {...a} value={form.description} onChange={set('description')} />}
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField id="domain-weight" label="Weight (%)" description="Share of the section on the test. Used to auto-fill exams." error={err(errors, 'weight_percent')}>
                {(a) => <Input {...a} type="number" min={0} max={100} step="0.01" value={form.weight_percent} onChange={set('weight_percent')} />}
              </FormField>
              <FormField id="domain-position" label="Position" error={err(errors, 'position')}>
                {(a) => <Input {...a} type="number" min={0} value={form.position} onChange={set('position')} />}
              </FormField>
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                {editing ? 'Save domain' : 'Create domain'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function DeleteEntityButton({ kind, id, name, disabledReason }: { kind: 'domain' | 'skill'; id: string; name: string; disabledReason?: string }) {
  const [open, setOpen] = React.useState(false)
  const { pending, run } = useAction()
  return (
    <>
      <IconButton
        aria-label={disabledReason ? `${name}: ${disabledReason}` : `Delete ${name}`}
        title={disabledReason}
        icon={<Trash2 />}
        size="icon-sm"
        disabled={Boolean(disabledReason)}
        onClick={() => setOpen(true)}
      />
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete ${kind} "${name}"?`}
        description="This cannot be undone. Deletion is refused while anything still uses it."
        confirmLabel={`Delete ${kind}`}
        destructive
        loading={pending}
        onConfirm={() => run(() => (kind === 'domain' ? deleteDomain(id) : deleteSkill(id)), () => setOpen(false))}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

type SkillValue = { id?: string; domain_id: string; code: string; name: string; description: string; learning_objectives: string[]; position: number }

export function SkillDialogButton({ domains, skill }: { domains: Array<{ id: string; name: string; subjectName: string }>; skill?: SkillValue }) {
  const editing = Boolean(skill?.id)
  const [open, setOpen] = React.useState(false)
  const { pending, errors, run } = useAction()
  const initial = {
    domain_id: skill?.domain_id ?? domains[0]?.id ?? '',
    code: skill?.code ?? '',
    name: skill?.name ?? '',
    description: skill?.description ?? '',
    position: String(skill?.position ?? 0),
    learning_objectives: skill?.learning_objectives?.length ? skill.learning_objectives : [''],
  }
  const [form, setForm] = React.useState(initial)
  const setObjective = (i: number, v: string) => setForm({ ...form, learning_objectives: form.learning_objectives.map((o, j) => (j === i ? v : o)) })

  return (
    <>
      {editing ? (
        <IconButton aria-label={`Edit ${skill!.name}`} icon={<Pencil />} size="icon-sm" onClick={() => setOpen(true)} />
      ) : (
        <Button onClick={() => { setForm(initial); setOpen(true) }}>
          <Plus /> New skill
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit skill' : 'New skill'}</DialogTitle>
            <DialogDescription>
              {editing ? 'The code and domain are fixed once created; imports and questions reference them.' : 'Codes are used by the CSV importer (skill_code) and cannot change later.'}
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid grid-cols-1 gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              const payload = {
                name: form.name,
                description: form.description,
                position: form.position,
                learning_objectives: form.learning_objectives.map((o) => o.trim()).filter(Boolean),
              }
              run(
                () => (editing ? updateSkill({ id: skill!.id, ...payload }) : createSkill({ ...payload, domain_id: form.domain_id, code: form.code })),
                () => setOpen(false),
              )
            }}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField id="skill-domain" label="Domain" required error={err(errors, 'domain_id')}>
                {(a) => (
                  <NativeSelect {...a} value={form.domain_id} onChange={(e) => setForm({ ...form, domain_id: e.target.value })} disabled={editing}>
                    {domains.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.subjectName} · {d.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
              <FormField id="skill-code" label="Code" required error={err(errors, 'code')}>
                {(a) => <Input {...a} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={editing} className="font-mono" />}
              </FormField>
            </div>
            <FormField id="skill-name" label="Name" required error={err(errors, 'name')}>
              {(a) => <Input {...a} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
            </FormField>
            <FormField id="skill-description" label="Description" error={err(errors, 'description')}>
              {(a) => <Textarea {...a} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-16" />}
            </FormField>
            <fieldset className="grid grid-cols-1 gap-2">
              <legend className="mb-1 text-sm font-medium">Learning objectives</legend>
              {form.learning_objectives.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <Input aria-label={`Objective ${i + 1}`} value={o} onChange={(e) => setObjective(i, e.target.value)} placeholder="Students can…" />
                  <IconButton
                    aria-label={`Remove objective ${i + 1}`}
                    icon={<X />}
                    type="button"
                    onClick={() => setForm({ ...form, learning_objectives: form.learning_objectives.filter((_, j) => j !== i) })}
                  />
                </div>
              ))}
              {err(errors, 'learning_objectives') && <p className="text-[13px] text-destructive">{err(errors, 'learning_objectives')}</p>}
              <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => setForm({ ...form, learning_objectives: [...form.learning_objectives, ''] })}>
                <Plus /> Add objective
              </Button>
            </fieldset>
            <FormField id="skill-position" label="Position" error={err(errors, 'position')}>
              {(a) => <Input {...a} type="number" min={0} value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} className="w-28" />}
            </FormField>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                {editing ? 'Save skill' : 'Create skill'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
