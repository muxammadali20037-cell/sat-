'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Copy } from 'lucide-react'
import { useDict } from '@/lib/i18n/client'
import { format } from '@/lib/i18n/dict'
import { classroomDict } from '@/lib/i18n/dictionaries/classroom'
import type { ActionResult } from '@/lib/api/errors'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/card'
import { Label, NativeSelect } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { acceptGuestLinkAction, createGuestLinkAction, revokeGuestLinkAction } from '@/features/classroom/guest-actions'

export type GuestLinkView = { id: string; code: string; link: string; role: 'guest_teacher' | 'moderator'; uses: number; maxUses: number; revoked: boolean }

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
  return { pending, run, router }
}

export function GuestLinks({ workspaceId, sessionId, links, guests }: { workspaceId: string; sessionId: string; links: GuestLinkView[]; guests: Array<{ name: string; role: 'guest_teacher' | 'moderator' }> }) {
  const t = useDict(classroomDict).teach.guests
  const { pending, run } = useRun()
  const [role, setRole] = React.useState<'guest_teacher' | 'moderator'>('guest_teacher')
  const [maxUses, setMaxUses] = React.useState(1)
  return (
    <div className="space-y-4" data-testid="guest-links">
      {links.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t.empty}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {links.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm" data-guest-link={l.code}>
              <div className="min-w-0">
                <p className="font-mono text-[13px] text-foreground">{l.link}</p>
                <p className="text-xs text-muted-foreground">
                  {t.roles[l.role]} · {format(t.usedOf, { uses: l.uses, max: l.maxUses })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {l.revoked ? (
                  <Badge variant="neutral">{t.revoked}</Badge>
                ) : (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label="Copy"
                      onClick={() => void navigator.clipboard?.writeText(l.link).then(() => toast.success('✓'), () => undefined)}
                    >
                      <Copy aria-hidden />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => revokeGuestLinkAction({ workspaceId, linkId: l.id }))}>
                      {t.revoke}
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {guests.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t.joined}: {guests.map((g) => `${g.name} (${t.roles[g.role]})`).join(', ')}
        </p>
      )}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          run(() => createGuestLinkAction({ workspaceId, sessionId, role, maxUses }))
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="guest-role">{t.role}</Label>
          <NativeSelect id="guest-role" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="guest_teacher">{t.roles.guest_teacher}</option>
            <option value="moderator">{t.roles.moderator}</option>
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="guest-uses">{t.uses}</Label>
          <NativeSelect id="guest-uses" value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))}>
            {[1, 2, 3, 5, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" loading={pending}>
          {t.create}
        </Button>
      </form>
    </div>
  )
}

export function AcceptGuestButton({ code, label }: { code: string; label: string }) {
  const { pending, run, router } = useRun()
  return (
    <Button type="button" loading={pending} onClick={() => run(() => acceptGuestLinkAction({ code }), (r) => router.push(`/live/${r.data!.sessionId}`))}>
      {label}
    </Button>
  )
}
