'use client'

import * as React from 'react'
import { BookOpen, ExternalLink, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { LIBRARY_GROUPS, type LibraryGroup } from '@/features/resources/rules'
import type { LibraryItem } from '@/features/resources/server'

type Labels = {
  groups: Record<LibraryGroup, string>
  groupHints: Record<LibraryGroup, string>
  all: string
  search: string
  empty: string
  noMatch: string
  readingTip: string
}

/** The Library: shelves (tabs), a search box, and link cards that open on the source site. */
export function LibraryShelves({ items, labels }: { items: LibraryItem[]; labels: Labels }) {
  const [shelf, setShelf] = React.useState<LibraryGroup | 'all'>('all')
  const [q, setQ] = React.useState('')
  const present = LIBRARY_GROUPS.filter((g) => items.some((i) => i.group === g))
  const needle = q.trim().toLowerCase()
  const shown = items.filter((i) => (shelf === 'all' || i.group === shelf) && (!needle || `${i.title} ${i.description} ${i.attribution}`.toLowerCase().includes(needle)))
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{labels.empty}</p>
  const tab = (key: LibraryGroup | 'all', label: string, n: number) => (
    <button
      key={key}
      type="button"
      role="tab"
      aria-selected={shelf === key}
      onClick={() => setShelf(key)}
      className={cn('rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors', shelf === key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface text-foreground hover:bg-muted')}
    >
      {label} <span className="tabular opacity-70">{n}</span>
    </button>
  )
  return (
    <div className="space-y-5" data-testid="library">
      <div className="flex flex-wrap items-center gap-2" role="tablist">
        {tab('all', labels.all, items.length)}
        {present.map((g) => tab(g, labels.groups[g], items.filter((i) => i.group === g).length))}
      </div>
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input aria-label={labels.search} placeholder={labels.search} value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>
      {shown.length === 0 && <p className="text-sm text-muted-foreground">{labels.noMatch}</p>}
      {(shelf === 'all' ? present : [shelf]).map((g) => {
        const list = shown.filter((i) => i.group === g)
        if (list.length === 0) return null
        return (
          <section key={g} aria-labelledby={`shelf-${g}`} data-shelf={g}>
            <h2 id={`shelf-${g}`} className="text-[15px] font-semibold text-foreground">
              {labels.groups[g]}
            </h2>
            <p className="mt-0.5 mb-3 text-[13px] text-muted-foreground">{labels.groupHints[g]}</p>
            {g === 'classic' && <p className="mb-3 text-xs text-muted-foreground">{labels.readingTip}</p>}
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {list.map((i) => (
                <li key={i.id} className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-4">
                  <a href={i.url} target="_blank" rel="noopener noreferrer nofollow" className="group inline-flex items-start gap-2 text-[15px] font-medium text-foreground hover:text-primary">
                    <BookOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span>
                      {i.title}
                      <ExternalLink className="ml-1 inline size-3.5 align-[-2px] text-muted-foreground group-hover:text-primary" aria-hidden />
                    </span>
                  </a>
                  {i.description && <p className="text-[13px] text-muted-foreground">{i.description}</p>}
                  <p className="mt-auto pt-1 text-xs text-muted-foreground">
                    {i.attribution || i.providerName} · {i.host}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
