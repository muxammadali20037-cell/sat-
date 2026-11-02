import 'server-only'
import type { Db } from '@/lib/supabase/server'
import type { Json } from '@/types/database'
import { notFoundError } from '@/lib/api/errors'
import { wrapStudentMessage } from '@/lib/ai/prompts'
import type { AiMessage } from '@/lib/ai/types'
import { getEntitlements, getUsage } from '@/features/entitlements/server'
import type { Taxonomy } from '@/features/taxonomy/server'
import {
  StoredStructuredSchema,
  type ChatMessageView,
  type HintLevel,
  type MessageMode,
  type RelatedInfo,
  type StoredStructured,
  type UsageInfo,
} from './schemas'

/** Sessions, history, persistence and side panels for the tutor (service role after authorization). */

export async function ensureSession(
  admin: Db,
  userId: string,
  sessionId: string | undefined,
  create: { title: string; contextQuestionId: string | null },
): Promise<{ id: string; title: string; created: boolean }> {
  if (sessionId) {
    const { data, error } = await admin
      .from('ai_sessions')
      .select('id, title')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .is('archived_at', null)
      .maybeSingle()
    if (error) throw error
    if (!data) throw notFoundError('Conversation')
    return { id: data.id, title: data.title, created: false }
  }
  const { data, error } = await admin
    .from('ai_sessions')
    .insert({ user_id: userId, title: create.title.slice(0, 160) || 'New conversation', context_question_id: create.contextQuestionId })
    .select('id, title')
    .single()
  if (error) throw error
  return { id: data.id, title: data.title, created: true }
}

/** Remove a session created for a request that then failed (keeps history free of empty threads). */
export async function deleteSessionIfEmpty(admin: Db, userId: string, sessionId: string): Promise<void> {
  const { count } = await admin.from('ai_messages').select('id', { count: 'exact', head: true }).eq('session_id', sessionId)
  if ((count ?? 0) === 0) {
    await admin.from('ai_sessions').delete().eq('id', sessionId).eq('user_id', userId)
  }
}

const REQUEST_PLACEHOLDER: Record<MessageMode, string> = {
  chat: '(message)',
  explain: 'Please explain this question and my answer.',
  hint: 'Please give me a hint.',
  generate: 'Please generate a similar practice question.',
}

/** Last turns of the session for multi-turn context. Assistant text was stored already stripped. */
export async function loadHistory(admin: Db, userId: string, sessionId: string, limit = 8): Promise<AiMessage[]> {
  const { data, error } = await admin
    .from('ai_messages')
    .select('role, mode, content, created_at')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? [])
    .reverse()
    .map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content:
        m.role === 'assistant'
          ? m.content
          : wrapStudentMessage(m.content.trim() ? m.content : REQUEST_PLACEHOLDER[(m.mode as MessageMode) ?? 'chat']),
    }))
}

type MessageRow = {
  id: string
  role: string
  mode: string
  content: string
  structured: unknown
  question_id: string | null
  created_at: string
}

export function parseStructured(value: unknown): StoredStructured | null {
  if (value === null || value === undefined) return null
  const parsed = StoredStructuredSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** Rows → views; user rows in hint mode borrow the level from the assistant reply that follows. */
export function toMessageViews(rows: MessageRow[]): ChatMessageView[] {
  const views: ChatMessageView[] = rows.map((r) => ({
    id: r.id,
    role: r.role === 'assistant' ? 'assistant' : 'user',
    mode: (['chat', 'explain', 'hint', 'generate'].includes(r.mode) ? r.mode : 'chat') as MessageMode,
    content: r.content,
    structured: r.role === 'assistant' ? parseStructured(r.structured) : null,
    questionId: r.question_id,
    hintLevel: null,
    createdAt: r.created_at,
  }))
  for (let i = 0; i < views.length; i++) {
    const v = views[i]!
    const next = views[i + 1]
    if (v.role === 'user' && v.mode === 'hint' && next?.structured?.kind === 'tutor') {
      v.hintLevel = (next.structured.meta.hintLevel ?? null) as HintLevel | null
    }
    if (v.role === 'assistant' && v.structured?.kind === 'tutor') v.hintLevel = (v.structured.meta.hintLevel ?? null) as HintLevel | null
  }
  return views
}

export async function persistExchange(
  admin: Db,
  input: {
    sessionId: string
    userId: string
    mode: MessageMode
    questionId: string | null
    userContent: string
    assistantContent: string
    structured: StoredStructured
  },
): Promise<{ user: ChatMessageView; assistant: ChatMessageView }> {
  const userAt = new Date()
  const assistantAt = new Date(userAt.getTime() + 1)
  const { data, error } = await admin
    .from('ai_messages')
    .insert([
      {
        session_id: input.sessionId,
        user_id: input.userId,
        role: 'user',
        mode: input.mode,
        content: input.userContent.slice(0, 20_000),
        question_id: input.questionId,
        created_at: userAt.toISOString(),
      },
      {
        session_id: input.sessionId,
        user_id: input.userId,
        role: 'assistant',
        mode: input.mode,
        content: input.assistantContent.slice(0, 20_000),
        structured: input.structured as unknown as Json,
        question_id: input.questionId,
        created_at: assistantAt.toISOString(),
      },
    ])
    .select('id, role, mode, content, structured, question_id, created_at')
  if (error) throw error
  await admin.from('ai_sessions').update({ updated_at: new Date().toISOString() }).eq('id', input.sessionId).eq('user_id', input.userId)
  const views = toMessageViews(
    [...(data ?? [])].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.role === 'user' ? -1 : 1)),
  )
  const user = views.find((v) => v.role === 'user')!
  const assistant = views.find((v) => v.role === 'assistant')!
  return { user, assistant }
}

/** Today's AI request usage against the plan limit (null = unlimited). */
export async function currentUsage(userId: string, timeZone: string): Promise<UsageInfo> {
  const [ent, used] = await Promise.all([getEntitlements(userId), getUsage(userId, 'ai_requests_daily', timeZone)])
  const feature = ent.features.ai_requests_daily
  return { used, limit: feature.enabled ? feature.limit : 0 }
}

/** Related skill panel: taxonomy + up to three published lessons for the skill (RLS client). */
export async function loadRelated(db: Db, taxonomy: Taxonomy, skillId: string | null): Promise<RelatedInfo> {
  if (!skillId) return null
  const skill = taxonomy.skillById.get(skillId)
  if (!skill) return null
  const domain = taxonomy.domainById.get(skill.domainId)
  const subject = domain ? taxonomy.subjectById.get(domain.subjectId) : undefined
  if (!domain || !subject) return null
  const { data } = await db
    .from('lessons')
    .select('id, title, position')
    .eq('skill_id', skillId)
    .eq('status', 'published')
    .order('position')
    .limit(3)
  return {
    skillId,
    skillName: skill.name,
    domainId: domain.id,
    domainName: domain.name,
    subjectId: subject.id,
    subjectCode: subject.code,
    lessons: (data ?? []).map((l) => ({ id: l.id, title: l.title })),
  }
}
