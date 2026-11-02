/**
 * Diagnostic composition — pure (unit-tested in tests/unit/diagnostic-compose.test.ts).
 *
 * For every domain in scope: `perDomain` published questions, difficulty spread round-robin
 * easy → medium → hard (a short difficulty is filled from the others), random within those
 * constraints. Inside a difficulty we prefer questions the student has never answered, and then
 * skills not yet used in that domain, so a short diagnostic still covers as many skills as it can.
 */
import { DIFFICULTY_ORDER, mixedQuotas, orderByTier, tierOf, type AnswerHistory, type Difficulty, type Rng } from '@/features/practice/select'

export type DiagnosticCandidate = { id: string; domainId: string; skillId: string; difficulty: Difficulty }
export type DiagnosticDomain = { domainId: string; name: string }

export type ComposeResult =
  | { ok: true; questionIds: string[]; byDomain: Array<{ domainId: string; questionIds: string[] }> }
  | { ok: false; reason: 'not_enough_questions'; domainId: string; domainName: string; needed: number; available: number }
  | { ok: false; reason: 'empty_scope' }

function takeNext(list: DiagnosticCandidate[], usedSkills: Set<string>, history: AnswerHistory): DiagnosticCandidate | undefined {
  if (list.length === 0) return undefined
  // `list` is ordered by tier (never seen → previously incorrect → previously correct), random within tiers.
  const bestTier = tierOf(list[0]!.id, history)
  let pick = 0
  for (let i = 0; i < list.length; i++) {
    if (tierOf(list[i]!.id, history) !== bestTier) break
    if (!usedSkills.has(list[i]!.skillId)) {
      pick = i
      break
    }
  }
  return list.splice(pick, 1)[0]
}

export function composeDiagnostic(input: {
  domains: readonly DiagnosticDomain[]
  candidates: readonly DiagnosticCandidate[]
  perDomain: number
  history?: AnswerHistory
  rng?: Rng
}): ComposeResult {
  const rng = input.rng ?? Math.random
  const history: AnswerHistory = input.history ?? new Map()
  const perDomain = Math.max(1, Math.floor(input.perDomain))
  if (input.domains.length === 0) return { ok: false, reason: 'empty_scope' }

  const seen = new Set<string>()
  const byDomainPool = new Map<string, DiagnosticCandidate[]>()
  for (const c of input.candidates) {
    if (seen.has(c.id)) continue
    seen.add(c.id)
    const list = byDomainPool.get(c.domainId) ?? []
    list.push(c)
    byDomainPool.set(c.domainId, list)
  }

  const byDomain: Array<{ domainId: string; questionIds: string[] }> = []
  for (const domain of input.domains) {
    const pool = byDomainPool.get(domain.domainId) ?? []
    if (pool.length < perDomain) {
      return {
        ok: false,
        reason: 'not_enough_questions',
        domainId: domain.domainId,
        domainName: domain.name,
        needed: perDomain,
        available: pool.length,
      }
    }
    const lists: Record<Difficulty, DiagnosticCandidate[]> = {
      easy: orderByTier(pool.filter((c) => c.difficulty === 'easy'), history, rng),
      medium: orderByTier(pool.filter((c) => c.difficulty === 'medium'), history, rng),
      hard: orderByTier(pool.filter((c) => c.difficulty === 'hard'), history, rng),
    }
    const quota = mixedQuotas({ easy: lists.easy.length, medium: lists.medium.length, hard: lists.hard.length }, perDomain)
    const usedSkills = new Set<string>()
    const picked: string[] = []
    const rounds = Math.max(quota.easy, quota.medium, quota.hard)
    for (let r = 0; r < rounds; r++) {
      for (const d of DIFFICULTY_ORDER) {
        if (r >= quota[d]) continue
        const next = takeNext(lists[d], usedSkills, history)
        if (!next) continue
        usedSkills.add(next.skillId)
        picked.push(next.id)
      }
    }
    byDomain.push({ domainId: domain.domainId, questionIds: picked })
  }

  return { ok: true, questionIds: byDomain.flatMap((d) => d.questionIds), byDomain }
}

/** Number of questions a diagnostic will have: domains in scope × questions per domain. */
export function diagnosticQuestionCount(domainsInScope: number, questionsPerDomain: number): number {
  return Math.max(0, domainsInScope) * Math.max(0, questionsPerDomain)
}
