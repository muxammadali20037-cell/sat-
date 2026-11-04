/**
 * Workspace permissions (pure, unit-tested). The server calls `can()` before every classroom write;
 * the database RLS policies in migration 0019 mirror the same rules for reads.
 *
 *   owner / admin   manage the workspace, its staff and every group
 *   teacher         creates groups; teaches the groups they are assigned to
 *   assistant       like a teacher in their groups, but cannot create or archive groups
 *   student         sees their own groups, published assignments and their own work
 */

export const WORKSPACE_ROLES = ['owner', 'admin', 'teacher', 'assistant', 'student'] as const
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number]
export const STAFF_ROLES: readonly WorkspaceRole[] = ['owner', 'admin', 'teacher', 'assistant']
export const MANAGER_ROLES: readonly WorkspaceRole[] = ['owner', 'admin']

export type Action =
  | 'workspace.rename'
  | 'workspace.view_team'
  | 'staff.invite'
  | 'member.remove'
  | 'group.create'
  | 'group.archive'
  | 'group.view'
  | 'group.invite_students'
  | 'group.remove_student'
  | 'assignment.create'
  | 'assignment.close'
  | 'submission.grade'
  | 'student.view'
  | 'session.manage'
  | 'attendance.mark'
  | 'material.manage'
  | 'poll.manage'
  | 'challenge.manage'

/** `teachesGroup`: the actor is assigned to the group as a teacher or assistant. */
export type Context = { teachesGroup?: boolean }

export function isStaffRole(role: WorkspaceRole | null | undefined): boolean {
  return !!role && STAFF_ROLES.includes(role)
}
export function isManagerRole(role: WorkspaceRole | null | undefined): boolean {
  return !!role && MANAGER_ROLES.includes(role)
}

export function can(role: WorkspaceRole | null | undefined, action: Action, ctx: Context = {}): boolean {
  if (!role || role === 'student') return false
  const manager = isManagerRole(role)
  const inGroup = manager || !!ctx.teachesGroup
  switch (action) {
    case 'workspace.rename':
    case 'staff.invite':
    case 'member.remove':
      return manager
    case 'workspace.view_team':
    case 'student.view':
      return true // any staff member
    case 'group.create':
      return manager || role === 'teacher'
    case 'group.archive':
      return manager || (role === 'teacher' && !!ctx.teachesGroup)
    case 'group.view':
    case 'group.invite_students':
    case 'group.remove_student':
    case 'assignment.create':
    case 'assignment.close':
    case 'submission.grade':
    case 'session.manage':
    case 'attendance.mark':
    case 'material.manage':
    case 'poll.manage':
    case 'challenge.manage':
      return inGroup
  }
}

/** Roles a member may hand out in an invitation (owner/admin invite staff; group staff invite students). */
export function invitableRoles(role: WorkspaceRole | null | undefined): Array<'admin' | 'teacher' | 'assistant' | 'student'> {
  if (role === 'owner') return ['admin', 'teacher', 'assistant', 'student']
  if (role === 'admin') return ['teacher', 'assistant', 'student']
  if (role === 'teacher' || role === 'assistant') return ['student']
  return []
}
