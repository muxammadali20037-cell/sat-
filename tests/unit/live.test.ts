/**
 * PHASE 4-B: the live-lesson token is room-scoped with role-based grants (students cannot share
 * their screen or administer the room); board messages are validated, size-bounded and applied
 * only from staff; the joining window.
 */
import { describe, expect, it } from 'vitest'
import { TokenVerifier } from 'livekit-server-sdk'
import { issueLiveToken } from '@/features/live/server'
import { applyBoard, BoardMessageSchema, ClassMessageSchema, decode, encode, MAX_MESSAGE_BYTES, roleFromMetadata, simplify, type Stroke } from '@/features/live/protocol'
import { liveRoomName, liveWindow } from '@/features/classroom/lessons'

const cfg = { url: 'wss://example.livekit.cloud', apiKey: 'APItestkey', apiSecret: 'test-secret-that-is-long-enough-123' }
const SESSION = '11111111-1111-4111-8111-111111111111'

describe('live token', () => {
  it('staff: room-scoped, may share the screen and administer the room; metadata role is signed', async () => {
    const jwt = await issueLiveToken(cfg, { userId: 'u-teacher', name: 'Aziza', role: 'staff', sessionId: SESSION })
    const claims = await new TokenVerifier(cfg.apiKey, cfg.apiSecret).verify(jwt)
    expect(claims.sub).toBe('u-teacher')
    expect(claims.video?.room).toBe(liveRoomName(SESSION))
    expect(claims.video?.roomAdmin).toBe(true)
    expect(claims.video?.canPublishSources).toEqual(expect.arrayContaining(['camera', 'microphone', 'screen_share']))
    expect(roleFromMetadata(claims.metadata)).toBe('staff')
  })
  it('student: camera and microphone only, no admin, cannot change own metadata', async () => {
    const jwt = await issueLiveToken(cfg, { userId: 'u-student', name: 'Ali', role: 'student', sessionId: SESSION })
    const claims = await new TokenVerifier(cfg.apiKey, cfg.apiSecret).verify(jwt)
    expect(claims.video?.canPublishSources).toEqual(['camera', 'microphone'])
    expect(claims.video?.roomAdmin).toBeFalsy()
    expect(claims.video?.canUpdateOwnMetadata).toBe(false)
    expect(roleFromMetadata(claims.metadata)).toBe('student')
  })
  it('guest: can teach (screen share, board) but is no room admin and is marked as a guest', async () => {
    const jwt = await issueLiveToken(cfg, { userId: 'u-guest', name: 'Guest', role: 'guest', sessionId: SESSION })
    const claims = await new TokenVerifier(cfg.apiKey, cfg.apiSecret).verify(jwt)
    expect(claims.video?.canPublishSources).toEqual(expect.arrayContaining(['screen_share']))
    expect(claims.video?.roomAdmin).toBeFalsy()
    expect(JSON.parse(claims.metadata ?? '{}')).toEqual({ role: 'staff', guest: true })
    expect(claims.video?.room).toBe(liveRoomName(SESSION))
  })
  it('a token signed with another secret is rejected', async () => {
    const jwt = await issueLiveToken({ ...cfg, apiSecret: 'some-other-secret-value-1234567' }, { userId: 'x', name: 'x', role: 'staff', sessionId: SESSION })
    await expect(new TokenVerifier(cfg.apiKey, cfg.apiSecret).verify(jwt)).rejects.toThrow()
  })
})

describe('live window', () => {
  const start = '2026-11-05T10:00:00Z'
  it('opens 15 minutes before and closes 30 minutes after the end', () => {
    expect(liveWindow(start, 60, new Date('2026-11-05T09:44:00Z'))).toBe('too_early')
    expect(liveWindow(start, 60, new Date('2026-11-05T09:46:00Z'))).toBe('open')
    expect(liveWindow(start, 60, new Date('2026-11-05T11:29:00Z'))).toBe('open')
    expect(liveWindow(start, 60, new Date('2026-11-05T11:31:00Z'))).toBe('closed')
  })
})

describe('board protocol', () => {
  const stroke = (id: string): Stroke => ({ id, kind: 'pen', color: '#2563eb', width: 3, points: [[0.1, 0.1], [0.2, 0.3]] })
  it('only staff change the board; students cannot draw, undo, clear or replace it', () => {
    const board = [stroke('abcdef-1')]
    expect(applyBoard(board, { t: 'add', stroke: stroke('abcdef-2') }, 'student')).toBe(board)
    expect(applyBoard(board, { t: 'clear' }, 'student')).toBe(board)
    expect(applyBoard(board, { t: 'sync', strokes: [] }, 'student')).toBe(board)
    expect(applyBoard(board, { t: 'add', stroke: stroke('abcdef-2') }, 'staff')).toHaveLength(2)
    expect(applyBoard(board, { t: 'add', stroke: stroke('abcdef-1') }, 'staff')).toHaveLength(1) // duplicate id
    expect(applyBoard(board, { t: 'undo' }, 'staff')).toEqual([])
    expect(applyBoard(board, { t: 'sync-req' }, 'staff')).toBe(board)
  })
  it('rejects malformed, out-of-range or oversized messages', () => {
    const bad = [
      { t: 'add', stroke: { ...stroke('abcdef-3'), points: [[2, 0.5]] } },
      { t: 'add', stroke: { ...stroke('abcdef-3'), color: 'red' } },
      { t: 'add', stroke: { ...stroke('../../x'), kind: 'pen' } },
      { t: 'add', stroke: { ...stroke('abcdef-3'), text: 'x'.repeat(500) } },
      { t: 'eval', code: 'alert(1)' },
    ]
    for (const b of bad) expect(decode(BoardMessageSchema, encode(b))).toBeNull()
    expect(decode(BoardMessageSchema, new TextEncoder().encode('not json'))).toBeNull()
    expect(decode(BoardMessageSchema, new Uint8Array(MAX_MESSAGE_BYTES + 1))).toBeNull()
    expect(decode(ClassMessageSchema, encode({ t: 'chat', text: 'x'.repeat(501) }))).toBeNull()
    expect(decode(ClassMessageSchema, encode({ t: 'chat', text: '  hi ' }))).toEqual({ t: 'chat', text: 'hi' })
  })
  it('role defaults to student for missing or forged-looking metadata', () => {
    expect(roleFromMetadata(undefined)).toBe('student')
    expect(roleFromMetadata('not json')).toBe('student')
    expect(roleFromMetadata('{"role":"admin"}')).toBe('student')
  })
  it('simplify keeps the ends and drops near-duplicate points', () => {
    const pts: Array<[number, number]> = Array.from({ length: 100 }, (_, i) => [0.1 + i * 0.0001, 0.1])
    const out = simplify(pts)
    expect(out[0]).toEqual(pts[0])
    expect(out[out.length - 1]).toEqual(pts[99])
    expect(out.length).toBeLessThan(10)
  })
})
