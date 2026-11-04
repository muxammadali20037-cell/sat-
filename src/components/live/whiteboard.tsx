'use client'

import * as React from 'react'
import { Eraser, Minus, Pencil, Square, Type, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BOARD_COLORS, simplify, type Stroke } from '@/features/live/protocol'

type Tool = 'pen' | 'line' | 'rect' | 'text'
type Labels = { tools: { pen: string; line: string; rect: string; text: string; undo: string; clear: string }; textPrompt: string; viewOnly: string }

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

function draw(ctx: CanvasRenderingContext2D, s: Stroke, w: number, h: number) {
  ctx.strokeStyle = s.color
  ctx.fillStyle = s.color
  ctx.lineWidth = s.width * (w / 1000)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const p = s.points.map(([x, y]) => [x * w, y * h] as const)
  if (s.kind === 'text') {
    ctx.font = `${Math.max(12, s.width * 6 * (w / 1000))}px ui-sans-serif, system-ui, sans-serif`
    ctx.textBaseline = 'top'
    ctx.fillText(s.text ?? '', p[0]![0], p[0]![1])
    return
  }
  ctx.beginPath()
  if (s.kind === 'rect' && p.length >= 2) {
    const [a, b] = [p[0]!, p[p.length - 1]!]
    ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1])
    return
  }
  ctx.moveTo(p[0]![0], p[0]![1])
  if (s.kind === 'line') ctx.lineTo(p[p.length - 1]![0], p[p.length - 1]![1])
  else for (const [x, y] of p.slice(1)) ctx.lineTo(x, y)
  if (p.length === 1) ctx.lineTo(p[0]![0] + 0.1, p[0]![1] + 0.1)
  ctx.stroke()
}

/**
 * Shared board. Everyone sees the same strokes; only staff (`canDraw`) can add, undo or clear.
 * Drawing is local until the pointer is released, then sent as one stroke.
 */
export function Whiteboard({
  strokes,
  canDraw,
  onAdd,
  onUndo,
  onClear,
  labels,
}: {
  strokes: Stroke[]
  canDraw: boolean
  onAdd: (s: Stroke) => void
  onUndo: () => void
  onClear: () => void
  labels: Labels
}) {
  const wrap = React.useRef<HTMLDivElement>(null)
  const canvas = React.useRef<HTMLCanvasElement>(null)
  const [tool, setTool] = React.useState<Tool>('pen')
  const [color, setColor] = React.useState<(typeof BOARD_COLORS)[number]>(BOARD_COLORS[0])
  const [draft, setDraft] = React.useState<Stroke | null>(null)
  const [textAt, setTextAt] = React.useState<[number, number] | null>(null)
  const [text, setText] = React.useState('')
  const [size, setSize] = React.useState({ w: 800, h: 450 })

  React.useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      setSize({ w, h: Math.round((w * 9) / 16) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  React.useEffect(() => {
    const c = canvas.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = size.w * dpr
    c.height = size.h * dpr
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size.w, size.h)
    for (const s of strokes) draw(ctx, s, size.w, size.h)
    if (draft) draw(ctx, draft, size.w, size.h)
  }, [strokes, draft, size])

  const pos = (e: React.PointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect()
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]
  }

  const commitText = () => {
    if (textAt && text.trim()) onAdd({ id: newId(), kind: 'text', color, width: 4, points: [textAt], text: text.trim().slice(0, 200) })
    setTextAt(null)
    setText('')
  }

  const toolBtn = (key: Tool, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => setTool(key)}
      aria-pressed={tool === key}
      title={label}
      className={cn('inline-flex size-8 items-center justify-center rounded-md border [&_svg]:size-4', tool === key ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong text-foreground hover:bg-muted')}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </button>
  )

  return (
    <div className="space-y-2">
      {canDraw ? (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="board-tools">
          {toolBtn('pen', <Pencil />, labels.tools.pen)}
          {toolBtn('line', <Minus />, labels.tools.line)}
          {toolBtn('rect', <Square />, labels.tools.rect)}
          {toolBtn('text', <Type />, labels.tools.text)}
          <span className="mx-1 h-6 w-px bg-border" aria-hidden />
          {BOARD_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              className={cn('size-6 rounded-full border-2', color === c ? 'border-foreground' : 'border-transparent')}
              style={{ backgroundColor: c }}
            />
          ))}
          <span className="mx-1 h-6 w-px bg-border" aria-hidden />
          <button type="button" onClick={onUndo} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] hover:bg-muted">
            <Undo2 className="size-4" aria-hidden /> {labels.tools.undo}
          </button>
          <button type="button" onClick={onClear} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] hover:bg-muted">
            <Eraser className="size-4" aria-hidden /> {labels.tools.clear}
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{labels.viewOnly}</p>
      )}
      <div ref={wrap} className="relative w-full overflow-hidden rounded-lg border border-border bg-white">
        <canvas
          ref={canvas}
          data-testid="board-canvas"
          data-strokes={strokes.length}
          style={{ width: size.w, height: size.h, touchAction: canDraw ? 'none' : 'auto' }}
          className={canDraw ? 'cursor-crosshair' : ''}
          onPointerDown={(e) => {
            if (!canDraw) return
            const p = pos(e)
            if (tool === 'text') {
              setTextAt(p)
              return
            }
            ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
            setDraft({ id: newId(), kind: tool, color, width: tool === 'pen' ? 3 : 2, points: [p] })
          }}
          onPointerMove={(e) => {
            if (!draft) return
            const p = pos(e)
            setDraft((d) => (d ? { ...d, points: d.kind === 'pen' ? [...d.points, p] : [d.points[0]!, p] } : d))
          }}
          onPointerUp={() => {
            if (!draft) return
            onAdd({ ...draft, points: draft.kind === 'pen' ? simplify(draft.points) : draft.points })
            setDraft(null)
          }}
        />
        {textAt && (
          <form
            className="absolute"
            style={{ left: `${textAt[0] * 100}%`, top: `${textAt[1] * 100}%` }}
            onSubmit={(e) => {
              e.preventDefault()
              commitText()
            }}
          >
            <input
              autoFocus
              aria-label={labels.textPrompt}
              placeholder={labels.textPrompt}
              value={text}
              maxLength={200}
              onChange={(e) => setText(e.target.value)}
              onBlur={commitText}
              className="w-48 rounded border border-primary bg-white px-1.5 py-0.5 text-sm text-black outline-none"
            />
          </form>
        )}
      </div>
    </div>
  )
}
