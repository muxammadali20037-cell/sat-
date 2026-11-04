'use client'

import * as React from 'react'
import { apiFetch } from '@/lib/api/client'
import { CreatePollForm, StaffPollCard, StudentPollCard } from '@/components/classroom/poll-forms'
import type { StaffPollView, StudentPollView } from '@/features/classroom/polls'

type Data = { role: 'staff'; polls: StaffPollView[] } | { role: 'student'; polls: StudentPollView[] }

/**
 * Questions inside the live room. The server is the source of truth: a data-channel nudge only tells
 * everyone to re-fetch, so nothing about results or the quiz key travels peer to peer.
 */
export function LivePolls({
  sessionId,
  workspaceId,
  groupId,
  staff,
  version,
  onChanged,
  labels,
}: {
  sessionId: string
  workspaceId: string
  groupId: string
  staff: boolean
  version: number
  onChanged: () => void
  labels: { title: string; empty: string; ask: string }
}) {
  const [data, setData] = React.useState<Data | null>(null)
  React.useEffect(() => {
    let alive = true
    apiFetch<Data>(`/api/polls?sessionId=${sessionId}`)
      .then((d) => alive && setData(d))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [sessionId, version])
  const polls = data?.polls ?? []
  return (
    <section className="space-y-3" aria-label={labels.title} data-testid="live-polls">
      <h2 className="text-[13px] font-medium text-muted-foreground">{labels.title}</h2>
      {staff && (
        <details className="rounded-lg border border-border bg-surface p-3">
          <summary className="cursor-pointer text-sm font-medium text-foreground">{labels.ask}</summary>
          <div className="mt-3">
            <CreatePollForm workspaceId={workspaceId} groupId={groupId} sessionId={sessionId} onChanged={onChanged} />
          </div>
        </details>
      )}
      {polls.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{labels.empty}</p>
      ) : data?.role === 'staff' ? (
        data.polls.map((p) => <StaffPollCard key={p.id} poll={p} onChanged={onChanged} />)
      ) : (
        (data?.polls ?? []).map((p) => <StudentPollCard key={p.id} poll={p as StudentPollView} onChanged={onChanged} />)
      )}
    </section>
  )
}
