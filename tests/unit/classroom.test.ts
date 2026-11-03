/**
 * Classroom rules (PHASE 3): who may do what in a workspace, invitation codes, and the
 * assignment input schema. The database enforces the same boundaries (tests/integration/classroom-rls).
 */
import { describe, expect, it } from 'vitest'
import { can, invitableRoles, isManagerRole, isStaffRole, type Action, type WorkspaceRole } from '@/features/classroom/permissions'
import { CODE_ALPHABET, formatCode, generateCode, normalizeCode } from '@/features/classroom/codes'
import { CreateAssignmentSchema, CreateInvitationSchema } from '@/features/classroom/schemas'

const ACTIONS: Action[] = [
  'workspace.rename',
  'workspace.view_team',
  'staff.invite',
  'member.remove',
  'group.create',
  'group.archive',
  'group.view',
  'group.invite_students',
  'group.remove_student',
  'assignment.create',
  'assignment.close',
  'submission.grade',
  'student.view',
]

describe('workspace permissions', () => {
  it('students and outsiders can do nothing as staff', () => {
    for (const a of ACTIONS) {
      expect(can('student', a, { teachesGroup: true }), a).toBe(false)
      expect(can(null, a), a).toBe(false)
    }
  })
  it('owners and admins can do everything', () => {
    for (const role of ['owner', 'admin'] as WorkspaceRole[]) for (const a of ACTIONS) expect(can(role, a), `${role} ${a}`).toBe(true)
  })
  it('teachers manage only the groups they teach, and cannot manage staff', () => {
    expect(can('teacher', 'group.create')).toBe(true)
    expect(can('teacher', 'assignment.create', { teachesGroup: false })).toBe(false)
    expect(can('teacher', 'assignment.create', { teachesGroup: true })).toBe(true)
    expect(can('teacher', 'submission.grade', { teachesGroup: false })).toBe(false)
    expect(can('teacher', 'group.archive', { teachesGroup: true })).toBe(true)
    expect(can('teacher', 'staff.invite')).toBe(false)
    expect(can('teacher', 'member.remove')).toBe(false)
    expect(can('teacher', 'workspace.rename')).toBe(false)
  })
  it('assistants teach their groups but cannot create or archive groups', () => {
    expect(can('assistant', 'group.create')).toBe(false)
    expect(can('assistant', 'group.archive', { teachesGroup: true })).toBe(false)
    expect(can('assistant', 'assignment.create', { teachesGroup: true })).toBe(true)
    expect(can('assistant', 'submission.grade', { teachesGroup: true })).toBe(true)
    expect(can('assistant', 'group.invite_students', { teachesGroup: false })).toBe(false)
  })
  it('who can invite whom', () => {
    expect(invitableRoles('owner')).toEqual(['admin', 'teacher', 'assistant', 'student'])
    expect(invitableRoles('admin')).toEqual(['teacher', 'assistant', 'student'])
    expect(invitableRoles('teacher')).toEqual(['student'])
    expect(invitableRoles('student')).toEqual([])
    expect(isStaffRole('assistant') && !isStaffRole('student') && isManagerRole('admin') && !isManagerRole('teacher')).toBe(true)
  })
})

describe('invitation codes', () => {
  it('are 8 characters from an alphabet without look-alikes, uniformly', () => {
    expect(CODE_ALPHABET).toHaveLength(32)
    expect(CODE_ALPHABET).not.toMatch(/[01IO]/)
    const code = generateCode()
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
    // Deterministic bytes map straight through the alphabet.
    expect(generateCode(() => new Uint8Array([0, 1, 31, 32, 63, 255, 8, 9]))).toBe('AB9A99JK')
  })
  it('normalize what students type, and reject anything else', () => {
    expect(normalizeCode('abcd-ef23')).toBe('ABCDEF23')
    expect(normalizeCode(' ABCD EF23 ')).toBe('ABCDEF23')
    expect(normalizeCode('ABCD-EF2')).toBeNull()
    expect(normalizeCode('ABCD-EF2O')).toBeNull() // O is not in the alphabet
    expect(normalizeCode("x' or 1=1--")).toBeNull()
    expect(formatCode('ABCDEF23')).toBe('ABCD-EF23')
  })
})

describe('classroom input schemas', () => {
  const base = { workspaceId: '11111111-1111-4111-8111-111111111111', groupId: '22222222-2222-4222-8222-222222222222', title: 'Algebra homework' }
  it('a practice assignment needs a practice configuration; a mock exam needs an exam', () => {
    expect(CreateAssignmentSchema.safeParse({ ...base, kind: 'practice' }).success).toBe(false)
    expect(CreateAssignmentSchema.safeParse({ ...base, kind: 'practice', practice: { subjectCode: 'math', count: 10 } }).success).toBe(true)
    expect(CreateAssignmentSchema.safeParse({ ...base, kind: 'practice', practice: { subjectCode: 'math', count: 200 } }).success).toBe(false)
    expect(CreateAssignmentSchema.safeParse({ ...base, kind: 'mock_exam' }).success).toBe(false)
    expect(CreateAssignmentSchema.safeParse({ ...base, kind: 'text', points: 20 }).success).toBe(true)
    expect(CreateAssignmentSchema.safeParse({ ...base, kind: 'text', title: 'x' }).success).toBe(false)
  })
  it('invitations: bounded validity and use limits, no owner role', () => {
    const inv = { workspaceId: base.workspaceId, groupId: null, role: 'teacher', days: 7, maxUses: null }
    expect(CreateInvitationSchema.safeParse(inv).success).toBe(true)
    expect(CreateInvitationSchema.safeParse({ ...inv, role: 'owner' }).success).toBe(false)
    expect(CreateInvitationSchema.safeParse({ ...inv, days: 365 }).success).toBe(false)
    expect(CreateInvitationSchema.safeParse({ ...inv, maxUses: 0 }).success).toBe(false)
  })
})
