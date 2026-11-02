import { route } from '@/lib/api/route'
import { ApiError } from '@/lib/api/errors'
import { localDate } from '@/lib/time'
import {
  examDateIsAcceptable,
  PROFILE_DTO_COLUMNS,
  profileUpdateSchema,
  toProfileColumns,
  toProfileDto,
} from '@/features/profile/schemas'

/** GET /api/student/profile — the signed-in user's own profile (whitelisted fields). */
export const GET = route({
  auth: 'user',
  handler: async ({ db, user }) => {
    const { data, error } = await db.from('profiles').select(PROFILE_DTO_COLUMNS).eq('id', user.id).single()
    if (error) throw error
    return toProfileDto(data)
  },
})

/**
 * PATCH /api/student/profile — update own profile. The body is a strict whitelist (unknown keys
 * such as `role` are rejected with 400) and the update runs as the user, so RLS and the column
 * grants on public.profiles apply as a second line of defence.
 */
export const PATCH = route({
  auth: 'user',
  body: profileUpdateSchema,
  rateLimit: { bucket: 'profile-update', limit: 30, windowSec: 60 },
  handler: async ({ db, user, profile, body }) => {
    if (!examDateIsAcceptable(body.examDate, localDate(profile.timezone))) {
      throw new ApiError(400, 'VALIDATION_FAILED', 'Some fields are invalid.', { examDate: ['dateInPast'] })
    }
    const { data, error } = await db
      .from('profiles')
      .update(toProfileColumns(body))
      .eq('id', user.id)
      .select(PROFILE_DTO_COLUMNS)
      .single()
    if (error) throw error
    return toProfileDto(data)
  },
})
