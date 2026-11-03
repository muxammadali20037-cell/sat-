import { describe, expect, it } from 'vitest'
import { contextAccess, decideExplain, decideGenerateFromQuestion, decideHint, type QuestionFact } from '@/features/ai-tutor/gating'
import {
  applyExplainPolicy,
  applyHintPolicy,
  clampText,
  clampTutorResponse,
  cleanGeneratedDraft,
  formatStudentAnswer,
  formatVerifiedAnswer,
  hintRevealsAnswer,
  matchSkill,
  sessionTitle,
  TUTOR_LIMITS,
  tutorResponseToText,
  validateGeneratedDraft,
  type QuestionShape,
} from '@/features/ai-tutor/postprocess'
import { StoredStructuredSchema } from '@/features/ai-tutor/schemas'
import type { TutorResponse } from '@/lib/ai/schemas'

const practice = (over: Partial<QuestionFact> = {}): QuestionFact => ({
  attemptKind: 'practice',
  attemptStatus: 'in_progress',
  answered: true,
  isCorrect: false,
  ...over,
})

describe('tutor gating', () => {
  it('explain needs a scored answer', () => {
    expect(decideExplain([practice()])).toEqual({ allowed: true, reason: 'ok' })
    expect(decideExplain([practice({ answered: false, isCorrect: null })])).toEqual({ allowed: false, reason: 'not_answered' })
    expect(decideExplain([])).toEqual({ allowed: false, reason: 'not_encountered' })
  })
  it('explain allows completed (scored) diagnostics and exams', () => {
    expect(decideExplain([{ attemptKind: 'mock_exam', attemptStatus: 'completed', answered: true, isCorrect: true }]).allowed).toBe(true)
  })
  it('refuses anything that is in an in-progress diagnostic or mock exam, even if answered elsewhere', () => {
    const facts = [practice({ isCorrect: true }), { attemptKind: 'mock_exam' as const, attemptStatus: 'in_progress', answered: true, isCorrect: null }]
    expect(decideExplain(facts)).toEqual({ allowed: false, reason: 'in_timed_test' })
    expect(decideHint(facts)).toEqual({ allowed: false, reason: 'in_timed_test' })
    expect(decideGenerateFromQuestion(facts)).toEqual({ allowed: false, reason: 'in_timed_test' })
    expect(decideExplain([{ attemptKind: 'diagnostic', attemptStatus: 'in_progress', answered: false, isCorrect: null }]).reason).toBe('in_timed_test')
  })
  it('hint needs a practice encounter (answered or not)', () => {
    expect(decideHint([practice({ answered: false, isCorrect: null })])).toEqual({ allowed: true, reason: 'ok' })
    expect(decideHint([{ attemptKind: 'diagnostic', attemptStatus: 'completed', answered: true, isCorrect: true }])).toEqual({
      allowed: false,
      reason: 'not_encountered',
    })
    expect(decideHint([])).toEqual({ allowed: false, reason: 'not_encountered' })
  })
  it('summarises access for the UI', () => {
    expect(contextAccess([practice({ answered: false, isCorrect: null })])).toEqual({ explain: false, hint: true, reason: 'not_answered' })
    expect(contextAccess([practice()])).toEqual({ explain: true, hint: true, reason: 'ok' })
    expect(contextAccess([])).toEqual({ explain: false, hint: false, reason: 'not_encountered' })
  })
})

const mc: QuestionShape = {
  questionType: 'multiple_choice',
  options: [
    { id: 'o1', label: 'A', content: '2' },
    { id: 'o2', label: 'B', content: 'The author doubts the claim made by critics' },
    { id: 'o3', label: 'C', content: '4' },
    { id: 'o4', label: 'D', content: '5' },
  ],
}
const mcKey = { type: 'multiple_choice' as const, correctOptionId: 'o2' }
const spr: QuestionShape = { questionType: 'student_produced_response', options: [] }
const sprKey = { type: 'student_produced_response' as const, acceptedAnswers: ['3/4', '.75'] }

const response = (over: Partial<TutorResponse> = {}): TutorResponse => ({
  concept: 'Read the claim carefully.',
  identified_mistake: 'You confused the critics with the author.',
  hint: 'Look at the second sentence.',
  step_by_step_explanation: [{ title: 'Find the claim', body: 'It is in line 2.' }],
  final_answer: 'B',
  related_skill: 'Central ideas and details',
  next_exercise: 'Try two more.',
  misconception: null,
  choice_analysis: [],
  alternative_method: null,
  calculations: [],
  ...over,
})

describe('response post-processing', () => {
  it('hint policy strips the answer and the worked solution', () => {
    const out = applyHintPolicy(response())
    expect(out.final_answer).toBeNull()
    expect(out.step_by_step_explanation).toEqual([])
    expect(out.hint).toBe('Look at the second sentence.')
  })
  it('explain policy overrides the final answer with the verified key', () => {
    expect(applyExplainPolicy(response({ final_answer: 'C) 4' }), 'B) The author…').final_answer).toBe('B) The author…')
    expect(applyExplainPolicy(response({ final_answer: null }), 'B) x').final_answer).toBe('B) x')
  })
  it('formats verified and student answers', () => {
    expect(formatVerifiedAnswer(mc, mcKey)).toBe('B) The author doubts the claim made by critics')
    expect(formatVerifiedAnswer(spr, sprKey)).toBe('3/4 (also accepted: .75)')
    expect(formatStudentAnswer(mc, { selectedOptionId: 'o3', responseText: null })).toBe('C) 4')
    expect(formatStudentAnswer(spr, { selectedOptionId: null, responseText: ' 0.7 ' })).toBe('0.7')
    expect(formatStudentAnswer(mc, { selectedOptionId: null, responseText: null })).toBeNull()
  })
  it('clamps lengths, caps steps and nulls empty strings', () => {
    const long = 'word '.repeat(1000)
    const out = clampTutorResponse(
      response({
        concept: long,
        hint: '   ',
        step_by_step_explanation: Array.from({ length: 12 }, (_, i) => ({ title: `S${i}`, body: 'b' })),
      }),
    )
    expect(out.concept.length).toBeLessThanOrEqual(TUTOR_LIMITS.concept)
    expect(out.concept.endsWith('…')).toBe(true)
    expect(out.hint).toBeNull()
    expect(out.step_by_step_explanation).toHaveLength(TUTOR_LIMITS.steps)
  })
  it('never leaves an unmatched $ when clamping', () => {
    const text = `${'a '.repeat(40)}$x^2 + ${'y'.repeat(50)}$`
    const out = clampText(text, 90)
    expect((out.match(/\$/g) ?? []).length % 2).toBe(0)
  })
  it('renders a plain-text transcript for history', () => {
    const text = tutorResponseToText(response())
    expect(text).toContain('1. Find the claim: It is in line 2.')
    expect(text).toContain('Feedback: You confused')
  })
})

describe('hint leak detection (server-side key, never sent to the model)', () => {
  it('flags a hint that names the correct choice', () => {
    expect(hintRevealsAnswer(response({ hint: 'The answer is B.' }), mc, mcKey)).toBe(true)
    expect(hintRevealsAnswer(response({ hint: 'Choice (B) is correct' }), mc, mcKey)).toBe(true)
    expect(hintRevealsAnswer(response({ concept: 'Option B fits best.' }), mc, mcKey)).toBe(true)
  })
  it('flags a hint that quotes the correct option text', () => {
    expect(hintRevealsAnswer(response({ hint: 'Note: the author doubts the claim made by critics.' }), mc, mcKey)).toBe(true)
  })
  it('accepts a genuine hint and ignores stripped fields', () => {
    expect(hintRevealsAnswer(response({ final_answer: 'B', step_by_step_explanation: [{ title: 'B', body: 'answer is B' }] }), mc, mcKey)).toBe(false)
    expect(hintRevealsAnswer(response({ hint: 'Compare option A with the claim.' }), mc, mcKey)).toBe(false)
  })
  it('flags stated SPR answers only', () => {
    expect(hintRevealsAnswer(response({ hint: 'The answer is 3/4.' }), spr, sprKey)).toBe(true)
    expect(hintRevealsAnswer(response({ hint: 'Divide 3 by 4 to start.' }), spr, sprKey)).toBe(false)
  })
})

describe('generated practice drafts', () => {
  const draft = { stem: 'If $2x=8$, x?', passage: null, options: ['A) 2', '4', '6', '8'], correct_index: 1, explanation: 'Divide by 2.' }
  it('accepts a clean draft and strips choice prefixes', () => {
    expect(validateGeneratedDraft(draft)).toBeNull()
    expect(cleanGeneratedDraft(draft).options[0]).toBe('2')
  })
  it('rejects duplicates, blanks and empty explanations', () => {
    expect(validateGeneratedDraft({ ...draft, options: ['4', ' 4 ', '6', '8'] })).toBe('draft_duplicate_options')
    expect(validateGeneratedDraft({ ...draft, options: ['', '4', '6', '8'] })).toBe('draft_empty_option')
    expect(validateGeneratedDraft({ ...draft, explanation: ' ' })).toBe('draft_empty')
  })
})

describe('helpers', () => {
  const skills = [
    { id: 's1', name: 'Linear functions', code: 'linear_functions' },
    { id: 's2', name: 'Words in context', code: 'words_in_context' },
  ]
  it('maps model skill names onto the taxonomy', () => {
    expect(matchSkill('linear functions', skills)).toBe('s1')
    expect(matchSkill('Words in Context', skills)).toBe('s2')
    expect(matchSkill('Astrophysics', skills)).toBeNull()
    expect(matchSkill(null, skills)).toBeNull()
  })
  it('titles sessions without math delimiters', () => {
    expect(sessionTitle('Why is $x^2$ positive?')).toBe('Why is x^2 positive?')
    expect(sessionTitle('a'.repeat(200), 20)).toHaveLength(20)
  })
  it('stored structured payloads never need the generated answer key', () => {
    const ok = StoredStructuredSchema.safeParse({
      kind: 'generated_practice',
      generated: { id: 'g', stem: 's', passage: null, options: ['1', '2', '3', '4'], skillId: null, skillName: null, verified: true },
      meta: { provider: 'mock', skillId: null },
    })
    expect(ok.success).toBe(true)
    if (ok.success) expect(JSON.stringify(ok.data)).not.toMatch(/correct/)
  })
})
