export const ROLES = ['SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR', 'TEACHER', 'STUDENT'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_RANK: Record<Role, number> = {
  SUPER_ADMIN: 100,
  ADMIN: 80,
  CONTENT_EDITOR: 60,
  TEACHER: 40,
  STUDENT: 10,
}

/** Mirrors public.is_staff() */
export const STAFF_ROLES: readonly Role[] = ['SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR', 'TEACHER']
/** Mirrors public.is_content_manager() */
export const CONTENT_ROLES: readonly Role[] = ['SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR']
/** Mirrors public.is_admin() */
export const ADMIN_ROLES: readonly Role[] = ['SUPER_ADMIN', 'ADMIN']
/** Mirrors public.can_view_students() */
export const STUDENT_VIEWER_ROLES: readonly Role[] = ['SUPER_ADMIN', 'ADMIN', 'TEACHER']

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super admin',
  ADMIN: 'Admin',
  CONTENT_EDITOR: 'Content editor',
  TEACHER: 'Teacher',
  STUDENT: 'Student',
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

export function hasRole(role: Role | null | undefined, allowed: readonly Role[]): boolean {
  return !!role && allowed.includes(role)
}

/** Mirrors public.admin_set_user_role(): super admins may assign anything; others only below their rank. */
export function canAssignRole(actor: Role, targetCurrent: Role, next: Role): boolean {
  if (actor === 'SUPER_ADMIN') return true
  if (!ADMIN_ROLES.includes(actor)) return false
  return ROLE_RANK[targetCurrent] < ROLE_RANK[actor] && ROLE_RANK[next] < ROLE_RANK[actor]
}
