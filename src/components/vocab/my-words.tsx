'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { apiFetch, ApiClientError } from '@/lib/api/client'
import { useDict } from '@/lib/i18n/client'
import { vocabDict } from '@/lib/i18n/dictionaries/vocab'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import type { MyWord } from '@/features/vocab/server'

function useCall() {
  const router = useRouter()
  const [pending, start] = React.useTransition()
  const t = useDict(vocabDict)
  const call = (fn: () => Promise<unknown>, ok?: string, after?: () => void) =>
    start(async () => {
      try {
        await fn()
        if (ok) toast.success(ok)
        after?.()
        router.refresh()
      } catch (e) {
        toast.error(e instanceof ApiClientError ? e.message : t.error)
      }
    })
  return { pending, call }
}

export function AddWordForm() {
  const t = useDict(vocabDict)
  const { pending, call } = useCall()
  const [word, setWord] = React.useState('')
  const [translation, setTranslation] = React.useState('')
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        call(() => apiFetch('/api/vocab/words', { method: 'POST', body: { word, translation: translation || undefined, source: 'manual' } }), t.savedToast, () => {
          setWord('')
          setTranslation('')
        })
      }}
    >
      <div className="grid min-w-40 flex-1 gap-1.5">
        <Label htmlFor="vw-word">{t.addWord}</Label>
        <Input id="vw-word" value={word} onChange={(e) => setWord(e.target.value)} required maxLength={40} autoComplete="off" />
      </div>
      <div className="grid min-w-40 flex-1 gap-1.5">
        <Label htmlFor="vw-tr">{t.ownTranslation}</Label>
        <Input id="vw-tr" value={translation} onChange={(e) => setTranslation(e.target.value)} maxLength={200} autoComplete="off" />
      </div>
      <Button type="submit" loading={pending}>
        {t.add}
      </Button>
    </form>
  )
}

function WordRow({ w }: { w: MyWord }) {
  const t = useDict(vocabDict)
  const { pending, call } = useCall()
  const [editing, setEditing] = React.useState(false)
  const [value, setValue] = React.useState(w.ownTranslation ?? w.translation ?? '')
  return (
    <li className="space-y-1.5 px-4 py-3" data-word={w.word}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-foreground">
            {w.display}
            {w.pos && <span className="ml-2 text-xs font-normal text-muted-foreground">{w.pos}</span>}
          </p>
          {!editing && <p className="text-sm text-foreground">{w.translation ?? <span className="text-muted-foreground">{t.noTranslation}</span>}</p>}
        </div>
        <div className="flex items-center gap-1">
          <Badge variant={w.status === 'review' ? 'success' : w.status === 'due' ? 'warning' : 'neutral'}>{t.status[w.status]}</Badge>
          <Button type="button" size="sm" variant="ghost" aria-label={`${t.edit}: ${w.display}`} onClick={() => setEditing((v) => !v)}>
            <Pencil aria-hidden />
          </Button>
          <Button type="button" size="sm" variant="ghost" aria-label={`${t.remove}: ${w.display}`} disabled={pending} onClick={() => call(() => apiFetch(`/api/vocab/words?word=${encodeURIComponent(w.word)}`, { method: 'DELETE' }), t.removed)}>
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>
      {editing && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            call(() => apiFetch('/api/vocab/words', { method: 'PATCH', body: { word: w.word, translation: value } }), undefined, () => setEditing(false))
          }}
        >
          <Input aria-label={t.ownTranslation} value={value} onChange={(e) => setValue(e.target.value)} maxLength={200} className="min-w-40 flex-1" />
          <Button type="submit" size="sm" loading={pending}>
            {t.saveEdit}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            {t.cancel}
          </Button>
        </form>
      )}
      {w.definition && <p className="text-[13px] text-muted-foreground">{w.definition}</p>}
      {w.context && (
        <p className="text-[13px] italic text-muted-foreground">
          {t.yourSentence}: “{w.context}” · {t.sources[w.source as keyof typeof t.sources] ?? w.source}
        </p>
      )}
    </li>
  )
}

export function MyWordsList({ words }: { words: MyWord[] }) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-surface" data-testid="my-words">
      {words.map((w) => (
        <WordRow key={w.word} w={w} />
      ))}
    </ul>
  )
}
