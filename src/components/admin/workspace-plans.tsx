'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { ActionResult } from '@/lib/api/errors'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/card'
import { Input, Label, NativeSelect } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { assignWorkspacePlanAction, saveWorkspacePlanAction } from '@/features/admin/workspace-plan-actions'

export type PlanRow = { id: string; code: string; name: string; description: string; max_students: number | null; max_groups: number | null; live_lessons: boolean; is_default: boolean; is_active: boolean; position: number }
export type WorkspaceRow = { id: string; name: string; kind: string; owner: string; students: number; groups: number; planId: string | null; planUntil: string | null; effective: string }

function useRun() {
  const router = useRouter()
  const [pending, start] = React.useTransition()
  const run = <R,>(fn: () => Promise<ActionResult<R>>, onOk?: () => void) =>
    start(async () => {
      const res = await fn()
      if (res.ok) {
        if (res.message) toast.success(res.message)
        onOk?.()
        router.refresh()
      } else toast.error(res.error)
    })
  return { pending, run }
}

const num = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.floor(Number(v))))
const field = 'grid gap-1.5'

export function PlanEditor({ plans }: { plans: PlanRow[] }) {
  const { pending, run } = useRun()
  const empty = { id: undefined as string | undefined, code: '', name: '', description: '', maxStudents: '', maxGroups: '', liveLessons: true, isDefault: false, isActive: true, position: 0 }
  const [f, setF] = React.useState(empty)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {plans.length === 0 && <li className="p-4 text-sm text-muted-foreground">No plans yet. Without a default plan every workspace works without limits.</li>}
        {plans.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-plan={p.code}>
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {p.name} <span className="text-xs text-muted-foreground">({p.code})</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Students: {p.max_students ?? 'no limit'} · Groups: {p.max_groups ?? 'no limit'} · Live lessons: {p.live_lessons ? 'yes' : 'no'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {p.is_default && <Badge variant="primary">default</Badge>}
              {!p.is_active && <Badge variant="neutral">inactive</Badge>}
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setF({ id: p.id, code: p.code, name: p.name, description: p.description, maxStudents: p.max_students?.toString() ?? '', maxGroups: p.max_groups?.toString() ?? '', liveLessons: p.live_lessons, isDefault: p.is_default, isActive: p.is_active, position: p.position })
                }
              >
                Edit
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <form
        className="space-y-3 rounded-lg border border-border bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault()
          run(
            () => saveWorkspacePlanAction({ ...f, maxStudents: num(f.maxStudents), maxGroups: num(f.maxGroups) }),
            () => setF(empty),
          )
        }}
      >
        <h3 className="text-[15px] font-semibold">{f.id ? 'Edit plan' : 'New plan'}</h3>
        <p className="text-xs text-muted-foreground">Limits only. Prices are added when a payment provider for teacher plans is confirmed.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className={field}>
            <Label htmlFor="wp-code">Code</Label>
            <Input id="wp-code" value={f.code} onChange={(e) => set('code', e.target.value)} required pattern="[a-z0-9_]{2,40}" />
          </div>
          <div className={field}>
            <Label htmlFor="wp-name">Name</Label>
            <Input id="wp-name" value={f.name} onChange={(e) => set('name', e.target.value)} required minLength={2} maxLength={80} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className={field}>
            <Label htmlFor="wp-students">Max students (empty = no limit)</Label>
            <Input id="wp-students" type="number" min={0} value={f.maxStudents} onChange={(e) => set('maxStudents', e.target.value)} />
          </div>
          <div className={field}>
            <Label htmlFor="wp-groups">Max active groups (empty = no limit)</Label>
            <Input id="wp-groups" type="number" min={0} value={f.maxGroups} onChange={(e) => set('maxGroups', e.target.value)} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.liveLessons} onChange={(e) => set('liveLessons', e.target.checked)} className="size-4" /> In-app live lessons included
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.isDefault} onChange={(e) => set('isDefault', e.target.checked)} className="size-4" /> Default for workspaces without an assigned plan
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.isActive} onChange={(e) => set('isActive', e.target.checked)} className="size-4" /> Active
        </label>
        <div className="flex gap-2">
          <Button type="submit" loading={pending}>
            Save plan
          </Button>
          {f.id && (
            <Button type="button" variant="ghost" onClick={() => setF(empty)}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}

export function AssignPlan({ workspace, plans }: { workspace: WorkspaceRow; plans: PlanRow[] }) {
  const { pending, run } = useRun()
  const [planId, setPlanId] = React.useState(workspace.planId ?? '')
  const [until, setUntil] = React.useState(workspace.planUntil ? workspace.planUntil.slice(0, 10) : '')
  const [note, setNote] = React.useState('')
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => assignWorkspacePlanAction({ workspaceId: workspace.id, planId: planId || null, until: until ? new Date(`${until}T23:59:59+05:00`).toISOString() : null, note }))
      }}
    >
      <NativeSelect aria-label={`Plan for ${workspace.name}`} value={planId} onChange={(e) => setPlanId(e.target.value)} className="h-8 w-40">
        <option value="">No assigned plan</option>
        {plans
          .filter((p) => p.is_active)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
      </NativeSelect>
      <Input aria-label="Valid until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="h-8 w-36" />
      <Input aria-label="Note for the audit log" placeholder="Note (e.g. invoice no.)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="h-8 w-44" />
      <Button type="submit" size="sm" loading={pending}>
        Save
      </Button>
    </form>
  )
}
