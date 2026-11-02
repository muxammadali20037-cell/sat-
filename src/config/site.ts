import { publicEnv } from '@/lib/env'

export const siteConfig = {
  name: 'SAT MASTER',
  tagline: 'Learn Smarter. Score Higher.',
  description:
    'Prepare for the Digital SAT with structured lessons, intelligent practice, personalized learning, and AI-powered explanations.',
  url: publicEnv.NEXT_PUBLIC_SITE_URL,
  disclaimer:
    'SAT® is a trademark registered by the College Board, which is not affiliated with, and does not endorse, SAT MASTER.',
  estimateDisclaimer: 'SAT MASTER estimate — not an official College Board score.',
} as const

/** Official Digital SAT structure (used by the exam engine and marketing copy). */
export const SAT_STRUCTURE = {
  reading_writing: { questions: 54, minutes: 64, modules: 2, perModule: 27, moduleMinutes: 32 },
  math: { questions: 44, minutes: 70, modules: 2, perModule: 22, moduleMinutes: 35 },
  total: { questions: 98, minutes: 134 },
} as const
