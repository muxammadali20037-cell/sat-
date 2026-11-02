import * as React from 'react'
import Form from 'next/form'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Toolbar of list filters above admin tables. A GET form: filters live in the URL, work without
 * JavaScript and survive reloads; next/form adds client-side navigation.
 */
export function FilterBar({ action, resetHref, children, className }: { action: string; resetHref?: string; children: React.ReactNode; className?: string }) {
  return (
    <Form action={action} className={cn('mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3', className)}>
      {children}
      <div className="flex items-center gap-2">
        <button type="submit" className="inline-flex h-9 items-center rounded-md bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary-hover">
          Apply
        </button>
        {resetHref && (
          <Link href={resetHref} className="inline-flex h-9 items-center rounded-md px-3 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground">
            Reset
          </Link>
        )}
      </div>
    </Form>
  )
}

const controlCls =
  'h-9 rounded-md border border-input bg-surface px-2.5 text-[13px] text-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25'

export function FilterSearch({ name = 'q', defaultValue, placeholder, label = 'Search', className }: { name?: string; defaultValue?: string; placeholder?: string; label?: string; className?: string }) {
  const id = `filter-${name}`
  return (
    <div className={cn('grid grid-cols-1 min-w-[12rem] flex-1 gap-1', className)}>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input id={id} name={name} type="search" defaultValue={defaultValue} placeholder={placeholder} className={cn(controlCls, 'w-full pl-8')} />
      </div>
    </div>
  )
}

export function FilterSelect({
  name,
  label,
  defaultValue,
  options,
  className,
}: {
  name: string
  label: string
  defaultValue?: string
  options: ReadonlyArray<{ value: string; label: string }>
  className?: string
}) {
  const id = `filter-${name}`
  return (
    <div className={cn('grid grid-cols-1 gap-1', className)}>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <select id={id} name={name} defaultValue={defaultValue ?? ''} className={cn(controlCls, 'min-w-[8rem] pr-7')}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function FilterInput({ name, label, defaultValue, type = 'text', placeholder, className }: { name: string; label: string; defaultValue?: string; type?: 'text' | 'date' | 'email'; placeholder?: string; className?: string }) {
  const id = `filter-${name}`
  return (
    <div className={cn('grid grid-cols-1 gap-1', className)}>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <input id={id} name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} className={cn(controlCls, 'min-w-[9rem]')} />
    </div>
  )
}
