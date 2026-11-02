'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, ShieldOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { NativeSelect, Label } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { ROLES, ROLE_LABELS, ROLE_RANK, canAssignRole, type Role } from '@/config/roles'
import { changeUserRole, setUserSuspended } from '@/features/admin/student-actions'

/** Role change and suspension controls (admins). Options are limited by canAssignRole; SQL re-checks. */
export function StudentAdminActions({
  userId,
  email,
  currentRole,
  actorRole,
  isSuspended,
  isSelf,
}: {
  userId: string
  email: string
  currentRole: Role
  actorRole: Role
  isSuspended: boolean
  isSelf: boolean
}) {
  const router = useRouter()
  const [role, setRole] = React.useState<Role>(currentRole)
  const [confirmRole, setConfirmRole] = React.useState(false)
  const [confirmSuspend, setConfirmSuspend] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  const assignable = ROLES.filter((r) => r === currentRole || canAssignRole(actorRole, currentRole, r))
  const canChangeRole = !isSelf && assignable.length > 1
  // Mirrors admin_set_user_suspended: only accounts ranked below the actor.
  const canSuspend = !isSelf && ROLE_RANK[currentRole] < ROLE_RANK[actorRole]

  function applyRole() {
    startTransition(async () => {
      const res = await changeUserRole({ userId, role })
      if (res.ok) {
        toast.success(res.message ?? 'Role changed')
        setConfirmRole(false)
        router.refresh()
      } else toast.error(res.error)
    })
  }

  function applySuspend() {
    startTransition(async () => {
      const res = await setUserSuspended({ userId, suspended: !isSuspended })
      if (res.ok) {
        toast.success(res.message ?? 'Saved')
        setConfirmSuspend(false)
        router.refresh()
      } else toast.error(res.error)
    })
  }

  if (isSelf) {
    return <p className="text-sm text-muted-foreground">This is your own account. Another admin must change your role or suspend it.</p>
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-1 gap-1.5">
        <Label htmlFor="role-select">Role</Label>
        <div className="flex gap-2">
          <NativeSelect id="role-select" value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={!canChangeRole || pending} className="h-9">
            {assignable.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </NativeSelect>
          <Button size="sm" className="h-9" disabled={!canChangeRole || role === currentRole} onClick={() => setConfirmRole(true)}>
            Change role
          </Button>
        </div>
        {!canChangeRole && <p className="text-[13px] text-muted-foreground">Your role cannot change this account&apos;s role.</p>}
      </div>

      <div className="grid grid-cols-1 gap-1.5">
        <Label>Account access</Label>
        <Button
          variant={isSuspended ? 'secondary' : 'destructive'}
          size="sm"
          className="h-9 justify-self-start"
          disabled={!canSuspend || pending}
          onClick={() => setConfirmSuspend(true)}
        >
          {isSuspended ? <ShieldCheck /> : <ShieldOff />}
          {isSuspended ? 'Reactivate account' : 'Suspend account'}
        </Button>
        {!canSuspend && <p className="text-[13px] text-muted-foreground">Only higher-ranked admins can suspend this account.</p>}
      </div>

      <ConfirmDialog
        open={confirmRole}
        onOpenChange={setConfirmRole}
        title={`Change role to ${ROLE_LABELS[role]}?`}
        description={`${email} changes from ${ROLE_LABELS[currentRole]} to ${ROLE_LABELS[role]}. Their access changes on their next request. The change is recorded in the audit log.`}
        confirmLabel="Change role"
        loading={pending}
        onConfirm={applyRole}
      />
      <ConfirmDialog
        open={confirmSuspend}
        onOpenChange={setConfirmSuspend}
        title={isSuspended ? 'Reactivate this account?' : 'Suspend this account?'}
        description={
          isSuspended
            ? `${email} will be able to sign in and use the platform again.`
            : `${email} will be signed out of every feature and cannot use the platform until reactivated. Subscriptions and payments are not changed.`
        }
        confirmLabel={isSuspended ? 'Reactivate account' : 'Suspend account'}
        destructive={!isSuspended}
        loading={pending}
        onConfirm={applySuspend}
      />
    </div>
  )
}
