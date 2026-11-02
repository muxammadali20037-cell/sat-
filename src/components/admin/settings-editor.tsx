'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Globe } from 'lucide-react'
import { Badge } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/controls'
import { Input, Textarea } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import type { Json } from '@/types/database'
import { settingKind, settingToInput, validateSettingValue } from '@/features/admin/settings-values'
import { updateSettingAction } from '@/features/admin/settings-actions'

export type SettingRow = { id: string; key: string; value: Json; description: string; isPublic: boolean; updatedAt: string; updatedBy: string | null }

export function SettingEditor({ row }: { row: SettingRow }) {
  const router = useRouter()
  const kind = settingKind(row.value)
  const initial = settingToInput(row.value)
  const [input, setInput] = React.useState(initial)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, start] = React.useTransition()
  const dirty = input !== initial
  const id = `setting-${row.id}`

  function save(next = input) {
    const check = validateSettingValue(row.key, row.value, next)
    if (!check.ok) {
      setError(check.error)
      return
    }
    start(async () => {
      const res = await updateSettingAction({ id: row.id, input: next })
      if (res.ok) {
        setError(null)
        toast.success(`Saved ${row.key}`)
        router.refresh()
      } else {
        setError(res.fieldErrors?.value?.[0] ?? res.error)
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="grid grid-cols-1 gap-3 border-b border-border px-4 py-4 last:border-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={id} className="font-mono text-[13px] font-medium">
            {row.key}
          </label>
          {row.isPublic ? (
            <Badge variant="primary">
              <Globe /> Public
            </Badge>
          ) : (
            <Badge variant="neutral">
              <Lock /> Private
            </Badge>
          )}
          <Badge variant="outline">{kind}</Badge>
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">{row.description || 'No description.'}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Updated {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.updatedAt))}
          {row.updatedBy ? ` by ${row.updatedBy}` : ''}
        </p>
      </div>
      <div className="grid grid-cols-1 min-w-0 gap-2">
        {kind === 'boolean' ? (
          <div className="flex items-center gap-3">
            <Switch
              id={id}
              checked={input === 'true'}
              disabled={pending}
              onCheckedChange={(v) => {
                const next = v ? 'true' : 'false'
                setInput(next)
                save(next)
              }}
            />
            <span className="text-sm">{input === 'true' ? 'On' : 'Off'}</span>
          </div>
        ) : kind === 'json' ? (
          <Textarea
            id={id}
            value={input}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(e) => {
              setInput(e.target.value)
              setError(null)
            }}
            spellCheck={false}
            className="min-h-32 font-mono text-[12px]"
          />
        ) : (
          <Input
            id={id}
            type={kind === 'number' ? 'text' : 'text'}
            inputMode={kind === 'number' ? 'decimal' : undefined}
            value={input}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(e) => {
              setInput(e.target.value)
              setError(null)
            }}
            className={kind === 'number' ? 'max-w-40 tabular' : undefined}
          />
        )}
        {error && (
          <p id={`${id}-error`} role="alert" className="text-[13px] text-destructive">
            {error}
          </p>
        )}
        {kind !== 'boolean' && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => save()} disabled={!dirty} loading={pending}>
              Save
            </Button>
            {dirty && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setInput(initial)
                  setError(null)
                }}
              >
                Discard
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
