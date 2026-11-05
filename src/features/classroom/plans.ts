/**
 * Workspace plans (pure, client-safe). Plans set limits only — no prices — and are assigned by a
 * SAT MASTER administrator until a payment provider is confirmed.
 */
import { z } from 'zod'

export type WorkspacePlanLimits = { id: string; code: string; name: string; maxStudents: number | null; maxGroups: number | null; liveLessons: boolean }

export type PlanUsage = {
  plan: WorkspacePlanLimits | null
  /** Where the plan comes from: assigned to this workspace, the site default, or no plans at all. */
  source: 'assigned' | 'default' | 'none'
  until: string | null
  students: number
  groups: number
}

/** null = no limit. */
export const hasRoom = (used: number, max: number | null) => max === null || used < max

export const PlanSchema = z.object({
  id: z.guid().optional(),
  code: z.string().trim().regex(/^[a-z0-9_]{2,40}$/),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).default(''),
  maxStudents: z.number().int().min(0).max(100000).nullable(),
  maxGroups: z.number().int().min(0).max(10000).nullable(),
  liveLessons: z.boolean(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  position: z.number().int().min(0).max(1000).default(0),
})
export type PlanInput = z.input<typeof PlanSchema>

export const AssignPlanSchema = z.object({
  workspaceId: z.guid(),
  planId: z.guid().nullable(),
  until: z.iso.datetime({ offset: true }).nullable().default(null),
  note: z.string().trim().max(300).default(''),
})
