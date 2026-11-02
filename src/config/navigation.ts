import type { Role } from './roles'

/** Icon keys map to lucide icons inside components/layout/nav-icons.tsx (keeps config serializable). */
export type NavIconKey =
  | 'home' | 'courses' | 'practice' | 'diagnostic' | 'exams' | 'results' | 'analytics' | 'plan' | 'tutor'
  | 'bookmarks' | 'subscription' | 'settings' | 'students' | 'subjects' | 'domains' | 'skills' | 'lessons'
  | 'questions' | 'import' | 'payments' | 'ai' | 'audit' | 'admin'

export type NavItem = {
  href: string
  /** key into commonDict.nav for student nav; literal label for admin nav */
  labelKey: string
  icon: NavIconKey
  roles?: readonly Role[]
  /** match nested routes */
  exact?: boolean
}

export type NavSection = { title?: string; items: NavItem[] }

export const STUDENT_NAV: NavSection[] = [
  {
    items: [
      { href: '/dashboard', labelKey: 'dashboard', icon: 'home', exact: true },
      { href: '/dashboard/courses', labelKey: 'courses', icon: 'courses' },
      { href: '/dashboard/practice', labelKey: 'practice', icon: 'practice' },
      { href: '/dashboard/diagnostic', labelKey: 'diagnostic', icon: 'diagnostic' },
      { href: '/dashboard/mock-exams', labelKey: 'mockExams', icon: 'exams' },
      { href: '/dashboard/ai-tutor', labelKey: 'aiTutor', icon: 'tutor' },
    ],
  },
  {
    items: [
      { href: '/dashboard/study-plan', labelKey: 'studyPlan', icon: 'plan' },
      { href: '/dashboard/analytics', labelKey: 'analytics', icon: 'analytics' },
      { href: '/dashboard/results', labelKey: 'results', icon: 'results' },
      { href: '/dashboard/bookmarks', labelKey: 'bookmarks', icon: 'bookmarks' },
    ],
  },
]

export const STUDENT_ACCOUNT_NAV: NavItem[] = [
  { href: '/dashboard/subscription', labelKey: 'subscription', icon: 'subscription' },
  { href: '/dashboard/settings', labelKey: 'settings', icon: 'settings' },
]

/** Bottom tab bar on phones (five destinations max). */
export const STUDENT_MOBILE_TABS: NavItem[] = [
  { href: '/dashboard', labelKey: 'home', icon: 'home', exact: true },
  { href: '/dashboard/courses', labelKey: 'learn', icon: 'courses' },
  { href: '/dashboard/practice', labelKey: 'practice', icon: 'practice' },
  { href: '/dashboard/ai-tutor', labelKey: 'aiTutor', icon: 'tutor' },
]

const STAFF: Role[] = ['SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR', 'TEACHER']
const CONTENT: Role[] = ['SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR']
const ADMINS: Role[] = ['SUPER_ADMIN', 'ADMIN']
const VIEWERS: Role[] = ['SUPER_ADMIN', 'ADMIN', 'TEACHER']

export const ADMIN_NAV: NavSection[] = [
  { items: [{ href: '/admin', labelKey: 'Overview', icon: 'admin', exact: true, roles: STAFF }] },
  {
    title: 'People',
    items: [
      { href: '/admin/students', labelKey: 'Students', icon: 'students', roles: VIEWERS },
      { href: '/admin/subscriptions', labelKey: 'Subscriptions', icon: 'subscription', roles: ADMINS },
      { href: '/admin/payments', labelKey: 'Payments', icon: 'payments', roles: ADMINS },
    ],
  },
  {
    title: 'Content',
    items: [
      { href: '/admin/questions', labelKey: 'Question bank', icon: 'questions', roles: STAFF },
      { href: '/admin/question-import', labelKey: 'Import questions', icon: 'import', roles: CONTENT },
      { href: '/admin/courses', labelKey: 'Courses', icon: 'courses', roles: STAFF },
      { href: '/admin/lessons', labelKey: 'Lessons', icon: 'lessons', roles: STAFF },
      { href: '/admin/exams', labelKey: 'Mock exams', icon: 'exams', roles: STAFF },
      { href: '/admin/subjects', labelKey: 'Subjects', icon: 'subjects', roles: STAFF },
      { href: '/admin/domains', labelKey: 'Domains', icon: 'domains', roles: STAFF },
      { href: '/admin/skills', labelKey: 'Skills', icon: 'skills', roles: STAFF },
    ],
  },
  {
    title: 'Insights',
    items: [
      { href: '/admin/analytics', labelKey: 'Analytics', icon: 'analytics', roles: ADMINS },
      { href: '/admin/ai-usage', labelKey: 'AI usage', icon: 'ai', roles: ADMINS },
    ],
  },
  {
    title: 'System',
    items: [
      { href: '/admin/settings', labelKey: 'Settings', icon: 'settings', roles: ADMINS },
      { href: '/admin/audit-logs', labelKey: 'Audit log', icon: 'audit', roles: ADMINS },
    ],
  },
]

export const PUBLIC_NAV = [
  { href: '/features', labelKey: 'features' },
  { href: '/pricing', labelKey: 'pricing' },
  { href: '/about', labelKey: 'about' },
  { href: '/faq', labelKey: 'faq' },
] as const
