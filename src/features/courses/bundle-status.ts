import 'server-only'
import type { Db } from '@/lib/supabase/server'

/** Bundled lessons (content/courses) that this environment does not have yet, matched by slugs. */
export async function missingBundledLessons(db: Db): Promise<number> {
  const { BUNDLED_COURSES_JSON } = await import('./bundled.generated')
  const bundled = JSON.parse(BUNDLED_COURSES_JSON) as Array<{ slug: string; lessons: Array<{ slug: string }> }>
  const { data, error } = await db.from('courses').select('slug, lessons(slug)')
  if (error) throw error
  const have = new Map((data ?? []).map((c) => [c.slug, new Set((c.lessons ?? []).map((l) => l.slug))]))
  return bundled.reduce((n, c) => n + c.lessons.filter((l) => !have.get(c.slug)?.has(l.slug)).length, 0)
}
