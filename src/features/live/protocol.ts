/**
 * Live lesson data protocol (pure, client-safe, unit-tested). Messages travel over the LiveKit
 * data channel. Every incoming message is parsed with these schemas and size-bounded; whiteboard
 * changes are applied only when they come from a participant whose server-signed role is staff.
 * Coordinates are 0–1 fractions of the board so every screen size shows the same drawing.
 */
import { z } from 'zod'

export const BOARD_COLORS = ['#111827', '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed'] as const
export const MAX_POINTS = 1500
export const MAX_STROKES = 2000
export const MAX_CHAT = 500

const coord = z.number().min(0).max(1)
const point = z.tuple([coord, coord])

export const StrokeSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{6,40}$/),
  kind: z.enum(['pen', 'line', 'rect', 'text']),
  color: z.enum(BOARD_COLORS),
  width: z.number().min(1).max(16),
  points: z.array(point).min(1).max(MAX_POINTS),
  text: z.string().max(200).optional(),
})
export type Stroke = z.infer<typeof StrokeSchema>

export const BoardMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('add'), stroke: StrokeSchema }),
  z.object({ t: z.literal('undo') }),
  z.object({ t: z.literal('clear') }),
  z.object({ t: z.literal('sync-req') }),
  z.object({ t: z.literal('sync'), strokes: z.array(StrokeSchema).max(MAX_STROKES) }),
])
export type BoardMessage = z.infer<typeof BoardMessageSchema>

export const ClassMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('chat'), text: z.string().trim().min(1).max(MAX_CHAT) }),
  z.object({ t: z.literal('hand'), up: z.boolean() }),
  z.object({ t: z.literal('lower-all') }),
])
export type ClassMessage = z.infer<typeof ClassMessageSchema>

export const TOPIC_BOARD = 'board'
export const TOPIC_CLASS = 'class'

/** Largest message we accept from the wire (a full board sync). */
export const MAX_MESSAGE_BYTES = 900_000

export function decode<T>(schema: z.ZodType<T>, payload: Uint8Array): T | null {
  if (payload.byteLength > MAX_MESSAGE_BYTES) return null
  try {
    const parsed = schema.safeParse(JSON.parse(new TextDecoder().decode(payload)))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export const encode = (msg: unknown) => new TextEncoder().encode(JSON.stringify(msg))

/** The role the server signed into a participant's token metadata ('student' when unknown). */
export function roleFromMetadata(metadata: string | undefined | null): 'staff' | 'student' {
  try {
    return (JSON.parse(metadata ?? '{}') as { role?: string }).role === 'staff' ? 'staff' : 'student'
  } catch {
    return 'student'
  }
}

/**
 * Applies a board message to the current strokes. Changes from non-staff senders are ignored;
 * `sync-req` never changes the board (staff answer it with a `sync`).
 */
export function applyBoard(strokes: Stroke[], msg: BoardMessage, senderRole: 'staff' | 'student'): Stroke[] {
  if (msg.t === 'sync-req' || senderRole !== 'staff') return strokes
  switch (msg.t) {
    case 'add':
      if (strokes.some((s) => s.id === msg.stroke.id)) return strokes
      return [...strokes, msg.stroke].slice(-MAX_STROKES)
    case 'undo':
      return strokes.slice(0, -1)
    case 'clear':
      return []
    case 'sync':
      return msg.strokes
  }
}

/** Thins a freehand path: drops points closer than `minDist` to the last kept one (keeps the end). */
export function simplify(points: Array<[number, number]>, minDist = 0.002): Array<[number, number]> {
  if (points.length <= 2) return points
  const out: Array<[number, number]> = [points[0]!]
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i]!
    const [lx, ly] = out[out.length - 1]!
    if (Math.hypot(x - lx, y - ly) >= minDist) out.push(points[i]!)
  }
  out.push(points[points.length - 1]!)
  return out.slice(0, MAX_POINTS)
}
