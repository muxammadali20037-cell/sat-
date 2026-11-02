import type { Json } from '@/types/database'
import { cn } from '@/lib/utils'
import { diffJson, formatDiffValue } from '@/features/admin/audit-diff'

/** Server-rendered before/after table for an audit entry. */
export function AuditDiffView({ before, after }: { before: Json | null; after: Json | null }) {
  const entries = diffJson(before, after)
  if (before === null && after === null) return <p className="text-[13px] text-muted-foreground">No snapshot recorded for this entry.</p>
  if (entries.length === 0) return <p className="text-[13px] text-muted-foreground">No field changes (only timestamps).</p>
  return (
    <div className="overflow-x-auto relative rounded-md border border-border">
      <table className="w-full min-w-[520px] border-collapse text-[12px]">
        <caption className="sr-only">Field changes</caption>
        <thead className="bg-muted">
          <tr>
            <th scope="col" className="w-40 px-3 py-1.5 text-left font-medium text-muted-foreground">
              Field
            </th>
            <th scope="col" className="px-3 py-1.5 text-left font-medium text-muted-foreground">
              Before
            </th>
            <th scope="col" className="px-3 py-1.5 text-left font-medium text-muted-foreground">
              After
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.key} className="border-t border-border align-top">
              <th scope="row" className="px-3 py-1.5 text-left font-mono font-normal">
                {e.key}
                <span className="ml-1 text-muted-foreground">{e.change === 'added' ? '(added)' : e.change === 'removed' ? '(removed)' : ''}</span>
              </th>
              <td className={cn('px-3 py-1.5', e.change !== 'added' && 'bg-destructive-soft/50')}>
                <pre className="whitespace-pre-wrap break-all font-mono">{formatDiffValue(e.before)}</pre>
              </td>
              <td className={cn('px-3 py-1.5', e.change !== 'removed' && 'bg-success-soft/50')}>
                <pre className="whitespace-pre-wrap break-all font-mono">{formatDiffValue(e.after)}</pre>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
