/** Workspace plans: limits only (no prices), null = unlimited, assignment input bounds. */
import { describe, expect, it } from 'vitest'
import { AssignPlanSchema, hasRoom, PlanSchema } from '@/features/classroom/plans'

describe('workspace plans', () => {
  it('null means no limit; otherwise strictly below the limit', () => {
    expect(hasRoom(1000, null)).toBe(true)
    expect(hasRoom(29, 30)).toBe(true)
    expect(hasRoom(30, 30)).toBe(false)
    expect(hasRoom(0, 0)).toBe(false)
  })
  it('a plan has limits and flags only — there is no price field', () => {
    const p = PlanSchema.parse({ code: 'starter', name: 'Starter', maxStudents: 30, maxGroups: 3, liveLessons: false })
    expect(p).not.toHaveProperty('price')
    expect(Object.keys(PlanSchema.shape)).not.toContain('priceMinor')
    expect(PlanSchema.safeParse({ code: 'Bad Code', name: 'X y', maxStudents: 1, maxGroups: 1, liveLessons: true }).success).toBe(false)
    expect(PlanSchema.safeParse({ code: 'ok', name: 'Ok', maxStudents: -1, maxGroups: 1, liveLessons: true }).success).toBe(false)
  })
  it('assignment: a plan id or null (remove), optional end date', () => {
    const ws = '11111111-1111-4111-8111-111111111111'
    expect(AssignPlanSchema.safeParse({ workspaceId: ws, planId: null }).success).toBe(true)
    expect(AssignPlanSchema.safeParse({ workspaceId: ws, planId: ws, until: '2026-12-31T23:59:59+05:00' }).success).toBe(true)
    expect(AssignPlanSchema.safeParse({ workspaceId: ws, planId: 'pro' }).success).toBe(false)
  })
})
