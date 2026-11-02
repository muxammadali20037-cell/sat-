import 'server-only'
import { isSupabaseConfigured } from '@/lib/env'
import { createServerSupabase } from '@/lib/supabase/server'
import { getPublicPlans, type PublicPlan } from '@/features/plans/server'
import { unstable_rethrow } from 'next/navigation'

/**
 * Local mirror of supabase/migrations/20261102001000_reference_data.sql (plans + plan_features),
 * used only when the database is not configured or cannot be reached, so the public pricing page
 * still shows the standard prices. The database is the source of truth whenever it is available.
 */
export const FALLBACK_PLANS: PublicPlan[] = [
  {
    id: 'fallback-free',
    code: 'free',
    name: 'Free',
    description: 'Diagnostic test, limited daily practice and a taste of the AI tutor.',
    priceMinor: 0,
    currency: 'UZS',
    intervalMonths: 1,
    highlight: false,
    prices: [],
    features: {
      diagnostic: { enabled: true, limit: null },
      video_lessons: { enabled: false, limit: null },
      practice_questions_daily: { enabled: true, limit: 20 },
      ai_requests_daily: { enabled: true, limit: 3 },
      mock_exams_monthly: { enabled: false, limit: 0 },
      analytics_full: { enabled: false, limit: null },
      study_plan: { enabled: false, limit: null },
    },
  },
  {
    id: 'fallback-starter',
    code: 'starter',
    name: 'Starter',
    description: 'Full video course, daily practice, study plan and one mock exam a month.',
    priceMinor: 9_900_000,
    currency: 'UZS',
    intervalMonths: 1,
    highlight: false,
    prices: [{ currency: 'USD', amountMinor: 900 }],
    features: {
      diagnostic: { enabled: true, limit: null },
      video_lessons: { enabled: true, limit: null },
      practice_questions_daily: { enabled: true, limit: 100 },
      ai_requests_daily: { enabled: true, limit: 15 },
      mock_exams_monthly: { enabled: true, limit: 1 },
      analytics_full: { enabled: true, limit: null },
      study_plan: { enabled: true, limit: null },
    },
  },
  {
    id: 'fallback-pro',
    code: 'pro',
    name: 'Pro',
    description: 'Unlimited practice, more AI tutoring and four mock exams a month.',
    priceMinor: 19_900_000,
    currency: 'UZS',
    intervalMonths: 1,
    highlight: true,
    prices: [{ currency: 'USD', amountMinor: 1900 }],
    features: {
      diagnostic: { enabled: true, limit: null },
      video_lessons: { enabled: true, limit: null },
      practice_questions_daily: { enabled: true, limit: null },
      ai_requests_daily: { enabled: true, limit: 50 },
      mock_exams_monthly: { enabled: true, limit: 4 },
      analytics_full: { enabled: true, limit: null },
      study_plan: { enabled: true, limit: null },
    },
  },
  {
    id: 'fallback-premium',
    code: 'premium',
    name: 'Premium',
    description: 'Everything unlimited with the highest AI tutor allowance.',
    priceMinor: 39_900_000,
    currency: 'UZS',
    intervalMonths: 1,
    highlight: false,
    prices: [{ currency: 'USD', amountMinor: 3900 }],
    features: {
      diagnostic: { enabled: true, limit: null },
      video_lessons: { enabled: true, limit: null },
      practice_questions_daily: { enabled: true, limit: null },
      ai_requests_daily: { enabled: true, limit: 150 },
      mock_exams_monthly: { enabled: true, limit: null },
      analytics_full: { enabled: true, limit: null },
      study_plan: { enabled: true, limit: null },
    },
  },
]

/** Active public plans from the database (anon-readable via RLS), else the local mirror. */
export async function loadPublicPlans(): Promise<PublicPlan[]> {
  if (!isSupabaseConfigured) return FALLBACK_PLANS
  try {
    const plans = await getPublicPlans(await createServerSupabase())
    return plans.length > 0 ? plans : FALLBACK_PLANS
  } catch (err) {
    // Let Next.js control-flow errors (dynamic rendering bail-out, redirects) through untouched.
    unstable_rethrow(err)
    console.error('[pricing] could not load plans, using the reference prices', err)
    return FALLBACK_PLANS
  }
}
