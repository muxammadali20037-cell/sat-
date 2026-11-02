import { notFound, redirect } from 'next/navigation'
import { requireStudentReady } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { guideSlugsBySkill } from '@/features/guides/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Stable link target for "guide for this skill" (practice, results, lessons): resolves to the guide slug. */
export default async function GuideBySkillPage({ params }: { params: Promise<{ skillId: string }> }) {
  const { skillId } = await params
  if (!UUID.test(skillId)) notFound()
  await requireStudentReady()
  const slug = (await guideSlugsBySkill(await createServerSupabase()))[skillId]
  if (!slug) notFound()
  redirect(`/dashboard/guides/${slug}`)
}
