/**
 * A small, safe arithmetic evaluator used to check calculations the AI tutor states.
 *
 * It is not `eval`: input is tokenised against a fixed grammar (numbers, + - * / ^, parentheses,
 * sqrt and abs) and anything else makes the expression "unchecked". Sizes are bounded so a hostile
 * expression cannot hang the server. Results are plain doubles compared with a tolerance.
 */

export type CheckStatus = 'verified' | 'mismatch' | 'unchecked'
export type CalculationCheck = { expression: string; claimed: string; computed: string | null; status: CheckStatus }

export const MAX_EXPRESSION_LENGTH = 200
const MAX_TOKENS = 120
const MAX_DEPTH = 24
const MAX_EXPONENT = 64

type Token = { t: 'num'; v: number } | { t: 'op'; v: '+' | '-' | '*' | '/' | '^' } | { t: '(' } | { t: ')' } | { t: 'fn'; v: 'sqrt' | 'abs' }

/** Normalise the symbols models commonly use (×, ÷, −, ·, ², LaTeX \cdot \times \div). */
function normalise(input: string): string {
  return input
    .replace(/\\left|\\right/g, '')
    .replace(/\\cdot|\\times|×|·|⋅/g, '*')
    .replace(/\\div|÷/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/\\sqrt\s*\{([^{}]*)\}/g, 'sqrt($1)')
    .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '(($1)/($2))')
    .replace(/[{}]/g, (b) => (b === '{' ? '(' : ')'))
    .replace(/\$/g, '')
    .replace(/,(?=\d{3}(\D|$))/g, '') // thousands separators: 1,200 → 1200
    .trim()
}

function tokenize(src: string): Token[] | null {
  const out: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]!
    if (/\s/.test(ch)) {
      i++
      continue
    }
    const num = /^(\d+\.?\d*|\.\d+)/.exec(src.slice(i))
    if (num) {
      out.push({ t: 'num', v: Number(num[1]) })
      i += num[1]!.length
    } else if ('+-*/^'.includes(ch)) {
      out.push({ t: 'op', v: ch as '+' })
      i++
    } else if (ch === '(' || ch === '[') {
      out.push({ t: '(' })
      i++
    } else if (ch === ')' || ch === ']') {
      out.push({ t: ')' })
      i++
    } else if (src.startsWith('sqrt', i)) {
      out.push({ t: 'fn', v: 'sqrt' })
      i += 4
    } else if (src.startsWith('abs', i)) {
      out.push({ t: 'fn', v: 'abs' })
      i += 3
    } else {
      return null // letters, variables, unknown symbols → not plain arithmetic
    }
    if (out.length > MAX_TOKENS) return null
  }
  return out
}

/** Recursive-descent parser: expr := term (('+'|'-') term)*; term := factor (('*'|'/'|implicit) factor)*; factor := unary ('^' factor)? */
function evaluateTokens(tokens: Token[]): number | null {
  let pos = 0
  let depth = 0
  const peek = () => tokens[pos]
  const fail = () => {
    throw new Error('parse')
  }

  function primary(): number {
    const tok = peek()
    if (!tok) return fail()
    if (tok.t === 'num') {
      pos++
      return tok.v
    }
    if (tok.t === 'fn') {
      pos++
      const arg = primary()
      return tok.v === 'sqrt' ? (arg < 0 ? fail() : Math.sqrt(arg)) : Math.abs(arg)
    }
    if (tok.t === '(') {
      pos++
      if (++depth > MAX_DEPTH) fail()
      const v = expr()
      depth--
      if (peek()?.t !== ')') fail()
      pos++
      return v
    }
    return fail()
  }

  function unary(): number {
    const tok = peek()
    if (tok?.t === 'op' && (tok.v === '-' || tok.v === '+')) {
      pos++
      if (++depth > MAX_DEPTH) fail()
      const v = unary()
      depth--
      return tok.v === '-' ? -v : v
    }
    return power()
  }

  function power(): number {
    const base = primary()
    const tok = peek()
    if (tok?.t === 'op' && tok.v === '^') {
      pos++
      if (++depth > MAX_DEPTH) fail()
      const exp = unary()
      depth--
      if (Math.abs(exp) > MAX_EXPONENT) fail()
      return Math.pow(base, exp)
    }
    return base
  }

  function term(): number {
    let v = unary()
    for (;;) {
      const tok = peek()
      if (tok?.t === 'op' && (tok.v === '*' || tok.v === '/')) {
        pos++
        const r = unary()
        if (tok.v === '/' && r === 0) fail()
        v = tok.v === '*' ? v * r : v / r
      } else if (tok && (tok.t === '(' || tok.t === 'fn')) {
        v *= unary() // implicit multiplication: 2(3+4), 2sqrt(9)
      } else {
        return v
      }
    }
  }

  function expr(): number {
    let v = term()
    for (;;) {
      const tok = peek()
      if (tok?.t === 'op' && (tok.v === '+' || tok.v === '-')) {
        pos++
        const r = term()
        v = tok.v === '+' ? v + r : v - r
      } else {
        return v
      }
    }
  }

  try {
    const v = expr()
    if (pos !== tokens.length || !Number.isFinite(v)) return null
    return v
  } catch {
    return null
  }
}

/** Value of a plain arithmetic expression, or null when it is not one (variables, words, errors). */
export function evaluateArithmetic(input: string): number | null {
  if (typeof input !== 'string' || input.length > MAX_EXPRESSION_LENGTH) return null
  const tokens = tokenize(normalise(input))
  if (!tokens || tokens.length === 0) return null
  return evaluateTokens(tokens)
}

/** Decimal places written in a number, e.g. "3.14" → 2. */
function decimals(text: string): number {
  const m = /\.(\d+)/.exec(text)
  return m ? m[1]!.length : 0
}

export function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return String(Number(n.toPrecision(10)))
}

/**
 * Checks "expression = claimed". The claim may itself be arithmetic ("3/4") and may be marked
 * approximate ("≈ 3.14", "about 3.14"), in which case rounding to its written precision is accepted.
 */
export function checkCalculation(expression: string, claimed: string): CalculationCheck {
  const base = { expression: expression.trim().slice(0, MAX_EXPRESSION_LENGTH), claimed: claimed.trim().slice(0, 60) }
  const approx = /^\s*(≈|~|about|approx\.?|approximately)\s*/i.test(claimed)
  const claimText = claimed.replace(/^\s*(≈|~|about|approx\.?|approximately|=)\s*/i, '').trim()
  const computed = evaluateArithmetic(expression)
  const claimValue = evaluateArithmetic(claimText)
  if (computed === null || claimValue === null) return { ...base, computed: computed === null ? null : formatNumber(computed), status: 'unchecked' }
  const exactTol = 1e-9 * Math.max(1, Math.abs(computed))
  const roundTol = /^-?\d*\.\d+$/.test(claimText) || approx ? 0.5 * 10 ** -decimals(claimText) + exactTol : exactTol
  const ok = Math.abs(computed - claimValue) <= roundTol
  return { ...base, computed: formatNumber(computed), status: ok ? 'verified' : 'mismatch' }
}
