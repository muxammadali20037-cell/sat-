'use client'

import * as React from 'react'
import { BookmarkCheck, BookmarkPlus, ExternalLink, X } from 'lucide-react'
import { apiFetch, ApiClientError } from '@/lib/api/client'
import { useDict, useLocale } from '@/lib/i18n/client'
import { vocabDict } from '@/lib/i18n/dictionaries/vocab'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

type WordInfo = {
  word: string
  display: string
  found: boolean
  pos: string | null
  translation: string | null
  definition: string | null
  example: string | null
  saved: boolean
}
type Source = 'practice' | 'review' | 'lesson' | 'guide'
type Open = { text: string; context: string; rect: { top: number; left: number; bottom: number } }

const WORD = /^[A-Za-z][A-Za-z'’-]{0,39}$/

/** The sentence around the selected word, for "where you saw it" (max 400 characters). */
function sentenceAround(sel: Selection): string {
  const node = sel.anchorNode
  const text = (node?.textContent ?? '').replace(/\s+/g, ' ')
  const at = Math.min(sel.anchorOffset, text.length)
  const start = Math.max(text.lastIndexOf('. ', at), text.lastIndexOf('? ', at), text.lastIndexOf('! ', at))
  const endCandidates = ['. ', '? ', '! '].map((p) => text.indexOf(p, at)).filter((i) => i >= 0)
  const end = endCandidates.length ? Math.min(...endCandidates) + 1 : text.length
  return text.slice(start >= 0 ? start + 2 : 0, end).trim().slice(0, 400)
}

/**
 * Wrap reading content (passages, lessons, guides). Double-click or long-press one word to see its
 * translation and meaning from SAT MASTER's dictionary and save it to "My words". Not used in timed
 * exams.
 */
export function WordLookup({ source, sourceRef, children, className }: { source: Source; sourceRef?: string; children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [open, setOpen] = React.useState<Open | null>(null)

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const check = () => {
      const sel = window.getSelection()
      const root = ref.current
      if (!sel || sel.isCollapsed || !root || !sel.anchorNode || !root.contains(sel.anchorNode)) return
      const text = sel.toString().trim()
      if (!WORD.test(text)) return
      const r = sel.getRangeAt(0).getBoundingClientRect()
      setOpen({ text, context: sentenceAround(sel), rect: { top: r.top, left: r.left + r.width / 2, bottom: r.bottom } })
    }
    const onSelection = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(check, 450)
    }
    document.addEventListener('selectionchange', onSelection)
    return () => {
      document.removeEventListener('selectionchange', onSelection)
      if (timer) clearTimeout(timer)
    }
  }, [])

  return (
    <div ref={ref} className={className} data-word-lookup={source}>
      {children}
      {open && <WordPopover key={`${open.text}:${open.rect.top}`} open={open} source={source} sourceRef={sourceRef} onClose={() => setOpen(null)} />}
    </div>
  )
}

function WordPopover({ open, source, sourceRef, onClose }: { open: Open; source: Source; sourceRef?: string; onClose: () => void }) {
  const t = useDict(vocabDict)
  const locale = useLocale()
  const [info, setInfo] = React.useState<WordInfo | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [own, setOwn] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const boxRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const ctrl = new AbortController()
    apiFetch<WordInfo>(`/api/vocab/lookup?word=${encodeURIComponent(open.text)}`, { signal: ctrl.signal })
      .then(setInfo)
      .catch((e) => {
        if (!ctrl.signal.aborted) setFailed(true)
        return e
      })
    return () => ctrl.abort()
  }, [open.text])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('scroll', onClose, { passive: true })
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('scroll', onClose)
    }
  }, [onClose])

  async function save() {
    if (!info || saving) return
    setSaving(true)
    try {
      await apiFetch('/api/vocab/words', { method: 'POST', body: { word: info.word, context: open.context, source, sourceRef, translation: own.trim() || undefined } })
      setInfo({ ...info, saved: true, translation: info.translation ?? (own.trim() || null) })
      toast.success(t.savedToast)
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : t.error)
    } finally {
      setSaving(false)
    }
  }

  const target = locale === 'ru' ? 'ru' : 'uz'
  const translator = `https://translate.google.com/?sl=en&tl=${target}&text=${encodeURIComponent(open.text)}&op=translate`
  // Above the word when there is room, otherwise below; a bottom sheet on small screens (CSS).
  const above = open.rect.top > 280
  const style: React.CSSProperties = {
    left: Math.min(Math.max(open.rect.left, 170), (typeof window !== 'undefined' ? window.innerWidth : 1024) - 170),
    ...(above ? { bottom: (typeof window !== 'undefined' ? window.innerHeight : 800) - open.rect.top + 8 } : { top: open.rect.bottom + 8 }),
  }

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label={`${t.lookupTitle}: ${open.text}`}
      data-testid="word-popover"
      style={style}
      className={cn(
        'fixed z-50 w-[min(320px,calc(100vw-32px))] -translate-x-1/2 rounded-xl border border-border bg-surface p-4 text-sm shadow-lg',
        'max-sm:!inset-x-0 max-sm:!bottom-0 max-sm:!top-auto max-sm:!left-0 max-sm:w-full max-sm:translate-x-0 max-sm:rounded-b-none max-sm:pb-6',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[17px] font-semibold text-foreground">
          {info?.found ? info.word : open.text}
          {info?.pos && <span className="ml-2 text-xs font-normal text-muted-foreground">{info.pos}</span>}
        </p>
        <button type="button" onClick={onClose} aria-label={t.close} className="-m-1 rounded p-1 text-muted-foreground hover:text-foreground">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {!info && !failed && <p className="mt-2 text-muted-foreground">{t.loading}</p>}
      {failed && <p className="mt-2 text-destructive">{t.error}</p>}
      {info && (
        <div className="mt-2 space-y-2">
          {info.translation && <p className="text-[15px] font-medium text-foreground" data-testid="word-translation">{info.translation}</p>}
          {info.definition && <p className="text-[13px] text-muted-foreground">{info.definition}</p>}
          {info.example && (
            <p className="text-[13px] italic text-muted-foreground">
              {t.example}: {info.example}
            </p>
          )}
          {!info.found && !info.saved && (
            <>
              <p className="text-[13px] text-muted-foreground">{t.notFound}</p>
              <Input aria-label={t.ownTranslation} placeholder={t.ownTranslation} value={own} onChange={(e) => setOwn(e.target.value)} maxLength={200} />
            </>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {info.saved ? (
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-success">
                <BookmarkCheck className="size-4" aria-hidden /> {t.saved}
              </span>
            ) : (
              <Button type="button" size="sm" onClick={save} loading={saving}>
                <BookmarkPlus aria-hidden /> {t.save}
              </Button>
            )}
            <a href={translator} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] text-primary underline-offset-4 hover:underline">
              {t.openTranslator} <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

export function WordLookupHint({ className }: { className?: string }) {
  const t = useDict(vocabDict)
  return <p className={cn('text-xs text-muted-foreground', className)}>{t.hint}</p>
}
