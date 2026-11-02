import 'server-only'
import type { CurrentProfile } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { aiAvailability, type AiAvailability } from '@/lib/ai/provider'
import { getTaxonomy } from '@/features/taxonomy/server'
import { buildReveal, loadAnswerKeys, loadExplanations, loadSafeQuestions } from '@/features/questions/server'
import { lockedQuestionIds } from '@/features/practice/queries'
import type { RevealedAnswer, SafeQuestion } from '@/types/questions'
import { contextAccess, type AccessReason } from './gating'
import { loadQuestionFacts } from './context'
import { currentUsage, loadRelated, toMessageViews } from './server'
import type { ChatMessageView, GeneratedReveal, RelatedInfo, UsageInfo } from './schemas'
import { richTextExcerpt } from '@/lib/rich-text/tokenize'

export type TutorSessionItem = { id: string; title: string; updatedAt: string }
export type RecentQuestionItem = { questionId: string; skillName: string; excerpt: string; isCorrect: boolean; answeredAt: string }

export type TutorContext = {
  questionId: string
  question: SafeQuestion | null
  reveal: RevealedAnswer | null
  access: { explain: boolean; hint: boolean; reason: AccessReason }
}

export type TutorPageData = {
  availability: AiAvailability
  usage: UsageInfo
  sessions: TutorSessionItem[]
  recentQuestions: RecentQuestionItem[]
  session: { id: string; title: string } | null
  messages: ChatMessageView[]
  generatedReveals: Record<string, GeneratedReveal>
  context: TutorContext | null
  related: RelatedInfo
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const plain = (s: string, max: number) => richTextExcerpt(s, max)

export async function loadTutorPage(profile: CurrentProfile, params: { sessionId?: string; questionId?: string }): Promise<TutorPageData> {
  const db = await createServerSupabase()
  const admin = createAdminSupabase()
  const userId = profile.id
  const taxonomy = await getTaxonomy(db)

  const sessionId = params.sessionId && GUID.test(params.sessionId) ? params.sessionId : undefined

  const [usage, sessionsRes, recentRes, sessionRes] = await Promise.all([
    currentUsage(userId, profile.timezone).catch(() => ({ used: 0, limit: null }) as UsageInfo),
    db.from('ai_sessions').select('id, title, updated_at').eq('user_id', userId).is('archived_at', null).order('updated_at', { ascending: false }).limit(30),
    admin
      .from('attempt_answers')
      .select('question_id, is_correct, answered_at')
      .eq('user_id', userId)
      .not('is_correct', 'is', null)
      .order('answered_at', { ascending: false })
      .limit(40),
    sessionId
      ? db.from('ai_sessions').select('id, title, context_question_id').eq('id', sessionId).eq('user_id', userId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (sessionsRes.error) throw sessionsRes.error
  if (recentRes.error) throw recentRes.error

  // Recent answered questions (deduplicated), minus anything locked by a running timed test.
  const locked = await lockedQuestionIds(admin, userId)
  const recentAnswers: { questionId: string; isCorrect: boolean; answeredAt: string }[] = []
  const seen = new Set<string>()
  for (const a of recentRes.data ?? []) {
    if (seen.has(a.question_id) || locked.has(a.question_id) || a.is_correct === null) continue
    seen.add(a.question_id)
    recentAnswers.push({ questionId: a.question_id, isCorrect: a.is_correct, answeredAt: a.answered_at ?? '' })
    if (recentAnswers.length === 8) break
  }

  const session = sessionRes.data ? { id: sessionRes.data.id, title: sessionRes.data.title } : null
  const contextQuestionId =
    params.questionId && GUID.test(params.questionId) ? params.questionId : (sessionRes.data?.context_question_id ?? undefined)

  // Messages (RLS: own rows only).
  let messages: ChatMessageView[] = []
  if (session) {
    const { data, error } = await db
      .from('ai_messages')
      .select('id, role, mode, content, structured, question_id, created_at')
      .eq('session_id', session.id)
      .order('created_at')
      .order('role', { ascending: false })
      .limit(200)
    if (error) throw error
    messages = toMessageViews(data ?? [])
  }

  const generatedIds = messages.flatMap((m) => (m.structured?.kind === 'generated_practice' ? [m.structured.generated.id] : []))
  const generatedReveals: Record<string, GeneratedReveal> = {}
  if (generatedIds.length > 0) {
    const { data } = await admin
      .from('ai_generated_questions')
      .select('id, selected_index, correct_index, explanation')
      .eq('user_id', userId)
      .in('id', generatedIds)
      .not('selected_index', 'is', null)
    for (const g of data ?? []) {
      generatedReveals[g.id] = {
        selectedIndex: g.selected_index!,
        correctIndex: g.correct_index,
        isCorrect: g.selected_index === g.correct_index,
        explanation: g.explanation,
      }
    }
  }

  // Question context: content is shown only when the student may ask about it.
  let context: TutorContext | null = null
  if (contextQuestionId) {
    if (locked.has(contextQuestionId)) {
      context = { questionId: contextQuestionId, question: null, reveal: null, access: { explain: false, hint: false, reason: 'in_timed_test' } }
    } else {
      const { facts, latestScored } = await loadQuestionFacts(admin, userId, contextQuestionId)
      const access = contextAccess(facts)
      let question: SafeQuestion | null = null
      let reveal: RevealedAnswer | null = null
      if (access.explain || access.hint) {
        question = (await loadSafeQuestions(admin, [contextQuestionId])).get(contextQuestionId) ?? null
        if (question && access.explain && latestScored) {
          const [keys, explanations] = await Promise.all([
            loadAnswerKeys(admin, [contextQuestionId]),
            loadExplanations(admin, [contextQuestionId], profile.locale),
          ])
          reveal = buildReveal(contextQuestionId, keys.get(contextQuestionId), explanations.get(contextQuestionId), latestScored)
        }
      }
      context = { questionId: contextQuestionId, question, reveal, access }
    }
  }

  const recentQuestionMap = await loadSafeQuestions(admin, recentAnswers.map((a) => a.questionId))
  const recentQuestions: RecentQuestionItem[] = recentAnswers.flatMap((a) => {
    const q = recentQuestionMap.get(a.questionId)
    return q ? [{ questionId: a.questionId, skillName: q.skillName, excerpt: plain(q.stem, 90), isCorrect: a.isCorrect, answeredAt: a.answeredAt }] : []
  })

  const lastTutor = [...messages].reverse().find((m) => m.structured?.kind === 'tutor' || m.structured?.kind === 'generated_practice')
  const relatedSkillId =
    context?.question?.skillId ??
    (lastTutor?.structured?.kind === 'tutor'
      ? (lastTutor.structured.meta.relatedSkillId ?? null)
      : lastTutor?.structured?.kind === 'generated_practice'
        ? lastTutor.structured.meta.skillId
        : null)
  const related = await loadRelated(db, taxonomy, relatedSkillId)

  return {
    availability: aiAvailability(),
    usage,
    sessions: (sessionsRes.data ?? []).map((s) => ({ id: s.id, title: s.title, updatedAt: s.updated_at })),
    recentQuestions,
    session,
    messages,
    generatedReveals,
    context,
    related,
  }
}
