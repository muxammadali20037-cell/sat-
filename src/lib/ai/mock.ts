import { SCHEMA_NAMES } from './schemas'
import { AiCallError, type AiProvider, type GenerateStructuredRequest, type GenerateStructuredResult } from './types'

/**
 * Deterministic development provider (AI_PROVIDER=mock, never in production — see provider.ts).
 * Every text it produces starts with MOCK_LABEL so it cannot be mistaken for real tutoring, and
 * every output is validated against the requested Zod schema like a real response.
 */

export const MOCK_LABEL = 'Mock AI (development)'
export const MOCK_MODEL = 'mock'

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const estimateTokens = (text: string) => Math.max(1, Math.ceil(text.length / 4))

function mockTutor(system: string, user: string): unknown {
  const mode = /MODE: hint/.test(system) ? 'hint' : /MODE: explain/.test(system) ? 'explain' : 'chat'
  const skill = /Skill: ([^|\n]+)/.exec(user)?.[1]?.trim() ?? null
  const verified = /Verified correct answer: (.+)/.exec(user)?.[1]?.trim() ?? null
  const incorrect = /Student's answer: .*\(incorrect\)/.test(user)
  const level = Number(/Requested hint level: (\d)/.exec(user)?.[1] ?? 1)

  if (mode === 'hint') {
    return {
      concept: `${MOCK_LABEL}: placeholder hint generated without a language model.`,
      identified_mistake: null,
      hint: `${MOCK_LABEL}: level ${level} hint. Re-read what the question asks for and write down what you already know.`,
      step_by_step_explanation: [],
      final_answer: null,
      related_skill: skill,
      next_exercise: `${MOCK_LABEL}: try the next hint level if you are still stuck.`,
    }
  }
  return {
    concept: `${MOCK_LABEL}: this placeholder shows how a tutor answer is laid out. No language model was called.`,
    identified_mistake:
      mode === 'explain' && incorrect ? `${MOCK_LABEL}: your answer differs from the verified answer. Compare each step with the explanation.` : null,
    hint: null,
    step_by_step_explanation: [
      { title: 'Read the question', body: `${MOCK_LABEL}: identify what is given and what is asked.` },
      { title: 'Set up the relationship', body: 'Write it as an equation, for example $2x + 3 = 11$.' },
      { title: 'Solve and check', body: 'Solve step by step, then substitute back: $2(4) + 3 = 11$.' },
    ],
    final_answer: mode === 'explain' ? (verified ?? `${MOCK_LABEL}: answer`) : null,
    related_skill: skill,
    next_exercise: `${MOCK_LABEL}: answer two more questions on this skill.`,
  }
}

function mockGenerated(seed: number): unknown {
  const a = 2 + (seed % 7)
  const x = 3 + ((seed >>> 3) % 9)
  const b = 1 + ((seed >>> 7) % 15)
  const c = a * x + b
  const values = [x, x + 1, x + 2, x > 3 ? x - 1 : x + 3]
  const rotation = (seed >>> 11) % 4
  const options = values.map((_, i) => String(values[(i + rotation) % 4]))
  return {
    stem: `${MOCK_LABEL}: If $${a}x + ${b} = ${c}$, what is the value of $x$?`,
    passage: null,
    options,
    correct_index: options.indexOf(String(x)),
    explanation: `${MOCK_LABEL}: subtract ${b} from both sides to get $${a}x = ${a * x}$, then divide by ${a}: $x = ${x}$.`,
  }
}

/** Actually solves the mock's own "ax + b = c" questions, so verification agrees deterministically. */
function mockVerify(user: string): unknown {
  const eq = /\$(\d+)x \+ (\d+) = (\d+)\$/.exec(user)
  const choices = [...user.matchAll(/^(\d)\) (.+)$/gm)].map((m) => ({ index: Number(m[1]), text: m[2]!.trim() }))
  if (!eq || choices.length !== 4) {
    return { selected_index: 0, ambiguous: true, note: `${MOCK_LABEL}: cannot verify questions not produced by the mock.` }
  }
  const x = (Number(eq[3]) - Number(eq[2])) / Number(eq[1])
  const hit = choices.find((c) => Number(c.text) === x)
  return hit
    ? { selected_index: hit.index, ambiguous: false, note: `${MOCK_LABEL}: solved independently, x = ${x}.` }
    : { selected_index: 0, ambiguous: true, note: `${MOCK_LABEL}: no choice matches x = ${x}.` }
}

function mockNarrative(): unknown {
  return {
    weekly_objectives: [
      `${MOCK_LABEL}: complete every practice block scheduled this week.`,
      `${MOCK_LABEL}: review your incorrect answers on review day.`,
    ],
    rationale: `${MOCK_LABEL}: placeholder rationale. The schedule itself was computed by SAT MASTER's planning rules.`,
  }
}

export class MockAiProvider implements AiProvider {
  readonly id = 'mock' as const

  async generateStructured<T>(req: GenerateStructuredRequest<T>): Promise<GenerateStructuredResult<T>> {
    const started = Date.now()
    const user = [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? ''
    const seed = hash(`${req.jsonSchemaName}:${user}`)
    let raw: unknown
    switch (req.jsonSchemaName) {
      case SCHEMA_NAMES.tutor:
        raw = mockTutor(req.system, user)
        break
      case SCHEMA_NAMES.generated:
        raw = mockGenerated(seed)
        break
      case SCHEMA_NAMES.verification:
        raw = mockVerify(user)
        break
      case SCHEMA_NAMES.narrative:
        raw = mockNarrative()
        break
      default:
        throw new AiCallError('provider', 'mock_unknown_schema', `Mock provider has no fixture for ${req.jsonSchemaName}`)
    }
    const usage = {
      inputTokens: estimateTokens(req.system + req.messages.map((m) => m.content).join('')),
      outputTokens: estimateTokens(JSON.stringify(raw)),
    }
    const parsed = req.schema.safeParse(raw)
    if (!parsed.success) {
      throw new AiCallError('invalid_output', 'schema_mismatch', 'Mock output failed validation', usage, MOCK_MODEL, Date.now() - started)
    }
    return { data: parsed.data, usage, model: MOCK_MODEL, latencyMs: Date.now() - started }
  }
}
