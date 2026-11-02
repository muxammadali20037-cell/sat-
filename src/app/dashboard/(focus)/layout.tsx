import { requireStudentReady } from '@/lib/auth/session'

/** Distraction-free layout for timed tests (mock exams, diagnostic runner): no app chrome. */
export default async function FocusLayout({ children }: { children: React.ReactNode }) {
  await requireStudentReady()
  return <div className="min-h-dvh bg-background">{children}</div>
}
