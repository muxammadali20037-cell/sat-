/**
 * Maps Postgres / PostgREST errors to clear, actionable admin messages. Pure (no server deps)
 * so it is unit-tested and usable from server actions and route handlers alike.
 *
 * Codes we care about:
 *   23514 check_violation   — CHECK constraints and publish guards (their message is meaningful)
 *   23503 foreign_key_violation — ON DELETE RESTRICT (item still in use)
 *   23505 unique_violation  — duplicate code / slug / label
 *   42501 insufficient_privilege — role checks in SQL functions, RLS rejections
 *   P0002 no_data_found     — "Question not found", "User not found"
 *   P0001 raise_exception   — explicit business-rule exceptions
 *   22P02 invalid_text_representation — malformed uuid / number
 */

export type DbErrorLike = { code?: string | null; message?: string | null; details?: string | null; hint?: string | null }

export type DbErrorContext = {
  /** Human name of the entity, e.g. "skill", "lesson". */
  entity?: string
  /** Message for FK violations on delete (what still references the row). */
  inUse?: string
  /** Message for unique violations (which field must be unique). */
  duplicate?: string
}

/** Constraint name → specific message. Unknown constraints fall back to the generic text. */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  domains_code_key: 'A domain with this code already exists.',
  domains_code_check: 'Domain codes use 2–64 lowercase letters, digits or underscores.',
  domains_weight_percent_check: 'Weight must be between 0 and 100.',
  skills_code_key: 'A skill with this code already exists.',
  skills_code_check: 'Skill codes use 2–80 lowercase letters, digits or underscores.',
  courses_slug_key: 'A course with this slug already exists.',
  courses_slug_check: 'Slugs use lowercase letters, digits and single hyphens (e.g. "algebra-basics").',
  courses_title_check: 'Titles must be 3–160 characters.',
  lessons_course_id_slug_key: 'This course already has a lesson with this slug.',
  lessons_slug_check: 'Slugs use lowercase letters, digits and single hyphens (e.g. "linear-equations").',
  lessons_title_check: 'Titles must be 3–160 characters.',
  lessons_check: 'Set the lesson duration (greater than 0) before publishing.',
  lessons_duration_seconds_check: 'Duration must be between 0 and 6 hours.',
  lesson_contents_body_check: 'Lesson notes can be at most 50,000 characters.',
  lesson_contents_video_asset_id_check: 'The video asset id may only contain letters, digits, "/", "_", "." and "-".',
  lesson_resources_url_check: 'Resource links must start with https://.',
  lesson_resources_check: 'A link resource needs a URL and a file resource needs an uploaded file.',
  questions_check: 'A passage question needs passage text.',
  questions_check1: 'An image question needs an uploaded image and alt text.',
  questions_check2: 'Reviewed and published questions need a reviewer.',
  questions_stem_check: 'The question stem must be 1–5,000 characters.',
  questions_passage_check: 'The passage can be at most 10,000 characters.',
  questions_estimated_seconds_check: 'Estimated time must be between 10 and 900 seconds.',
  question_spr_answers_value_check: 'Accepted answers must be numbers, decimals or fractions of at most 6 characters.',
  answer_options_one_correct_idx: 'Only one option can be marked correct.',
  answer_options_content_check: 'Each option must be 1–2,000 characters.',
  question_explanations_content_check: 'Explanations must be 1–10,000 characters.',
  platform_settings_key_check: 'Setting keys use lowercase letters, digits, dots and underscores.',
  questions_domain_id_subject_id_fkey: 'The selected domain does not belong to the selected subject.',
  questions_skill_id_domain_id_fkey: 'The selected skill does not belong to the selected domain.',
}

function constraintFrom(err: DbErrorLike): string | null {
  const text = `${err.message ?? ''} ${err.details ?? ''}`
  const m = /constraint "([^"]+)"/.exec(text)
  return m ? m[1]! : null
}

/** Strips internal ids from guard messages ("Lesson 6f1… needs …" → "This lesson needs …"). */
function humanizeGuardMessage(message: string): string {
  return message
    .replace(/^Lesson [0-9a-f-]{36} needs/i, 'This lesson needs')
    .replace(/^Text lesson [0-9a-f-]{36} needs/i, 'This text lesson needs')
    .replace(/^Question [0-9a-f-]{36} is incomplete/i, 'This question is incomplete')
    .replace(/^Question [0-9a-f-]{36} not found/i, 'Question not found')
}

export function mapDbError(err: DbErrorLike | null | undefined, ctx: DbErrorContext = {}): string {
  if (!err) return 'Something went wrong. Try again.'
  const code = err.code ?? ''
  const message = (err.message ?? '').trim()
  const constraint = constraintFrom(err)
  const entity = ctx.entity ?? 'item'

  switch (code) {
    case '23503':
      // Deleting (or re-keying) a row that others still reference: ON DELETE RESTRICT.
      if (/update or delete on table/i.test(message) || /still referenced/i.test(err.details ?? '')) {
        return ctx.inUse ?? `This ${entity} is still in use and cannot be deleted. Archive it or move its content first.`
      }
      // Inserting/updating a row that points at a missing or mismatched parent.
      if (constraint && CONSTRAINT_MESSAGES[constraint]) return CONSTRAINT_MESSAGES[constraint]!
      return `A referenced record does not exist. Reload the page and try again.`
    case '23505':
      if (constraint && CONSTRAINT_MESSAGES[constraint]) return CONSTRAINT_MESSAGES[constraint]!
      return ctx.duplicate ?? `A ${entity} with these details already exists.`
    case '23514':
      if (constraint && CONSTRAINT_MESSAGES[constraint]) return CONSTRAINT_MESSAGES[constraint]!
      // Guards raise check_violation with a meaningful message and no constraint name.
      if (message && !/violates check constraint/i.test(message)) return humanizeGuardMessage(message)
      return `Some values are not allowed for this ${entity}.`
    case '42501':
      if (/row-level security/i.test(message)) return 'You do not have permission to change this.'
      if (message && message !== 'Not allowed') return message.endsWith('.') ? message : `${message}.`
      return 'You do not have permission to do this.'
    case 'P0002':
      return message ? humanizeGuardMessage(message) : `This ${entity} no longer exists.`
    case 'P0001':
      return message || 'This action is not allowed.'
    case '22P02':
      return 'One of the values has an invalid format.'
    case '23502':
      return 'A required value is missing.'
    case 'PGRST116':
      return `This ${entity} no longer exists.`
    default:
      return 'Something went wrong saving your changes. Try again.'
  }
}

/** Whether an error is a client-correctable business error (vs. an unexpected failure worth logging). */
export function isExpectedDbError(err: DbErrorLike | null | undefined): boolean {
  return !!err && ['23503', '23505', '23514', '42501', 'P0001', 'P0002', '22P02', '23502', 'PGRST116'].includes(err.code ?? '')
}
