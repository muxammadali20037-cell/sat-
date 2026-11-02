import * as React from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'

type Field =
  | { kind: 'search'; name: string; label: string; placeholder: string; value?: string }
  | { kind: 'select'; name: string; label: string; value?: string; options: Array<{ value: string; label: string }> }
  | { kind: 'date'; name: string; label: string; value?: string }

/** GET filter toolbar for server-rendered admin tables (works without JavaScript). */
export function FilterForm({ action, fields }: { action: string; fields: Field[] }) {
  return (
    <form action={action} method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
      {fields.map((f) => (
        <label key={f.name} className={f.kind === 'search' ? 'grid min-w-56 flex-1 gap-1' : 'grid gap-1'}>
          <span className="text-xs font-medium text-muted-foreground">{f.label}</span>
          {f.kind === 'search' ? (
            <Input name={f.name} defaultValue={f.value} placeholder={f.placeholder} className="h-9" />
          ) : f.kind === 'date' ? (
            <Input type="date" name={f.name} defaultValue={f.value} className="h-9" />
          ) : (
            <NativeSelect name={f.name} defaultValue={f.value ?? ''} className="h-9 min-w-36">
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          )}
        </label>
      ))}
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="h-9">
          <Search aria-hidden /> Apply
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-9">
          <Link href={action}>Reset</Link>
        </Button>
      </div>
    </form>
  )
}
