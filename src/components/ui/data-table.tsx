import * as React from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState } from './states'

export type Column<T> = {
  key: string
  header: React.ReactNode
  cell: (row: T) => React.ReactNode
  className?: string
  /** Hide below this breakpoint to keep tables readable on phones. */
  hideBelow?: 'sm' | 'md' | 'lg'
  align?: 'left' | 'right' | 'center'
}

const hideClass = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' }

/** Server-friendly table. Horizontal scroll is contained inside the table frame, never the page. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  caption,
  className,
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  empty?: { title: string; description?: React.ReactNode; action?: React.ReactNode }
  caption?: string
  className?: string
}) {
  if (rows.length === 0 && empty) {
    return <EmptyState title={empty.title} description={empty.description} action={empty.action} />
  }
  return (
    <div className={cn('overflow-x-auto rounded-lg border border-border bg-card', className)}>
      <table className="w-full min-w-[560px] border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  'h-10 whitespace-nowrap px-4 text-left text-xs font-medium text-muted-foreground',
                  c.align === 'right' && 'text-right',
                  c.align === 'center' && 'text-center',
                  c.hideBelow && hideClass[c.hideBelow],
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-border last:border-0 hover:bg-muted/40">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    'px-4 py-3 align-middle',
                    c.align === 'right' && 'text-right tabular',
                    c.align === 'center' && 'text-center',
                    c.hideBelow && hideClass[c.hideBelow],
                    c.className,
                  )}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Link-based pagination (works in Server Components via searchParams). */
export function Pagination({
  page,
  pageSize,
  total,
  hrefForPage,
}: {
  page: number
  pageSize: number
  total: number
  hrefForPage: (page: number) => string
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  const linkCls = 'inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-[13px] hover:bg-muted'
  return (
    <nav aria-label="Pagination" className="mt-3 flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
      <span className="tabular">
        {from}–{to} of {total}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link className={linkCls} href={hrefForPage(page - 1)}>
            <ChevronLeft className="size-4" /> Previous
          </Link>
        ) : (
          <span className={cn(linkCls, 'pointer-events-none opacity-40')}>
            <ChevronLeft className="size-4" /> Previous
          </span>
        )}
        {page < pages ? (
          <Link className={linkCls} href={hrefForPage(page + 1)}>
            Next <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span className={cn(linkCls, 'pointer-events-none opacity-40')}>
            Next <ChevronRight className="size-4" />
          </span>
        )}
      </div>
    </nav>
  )
}
