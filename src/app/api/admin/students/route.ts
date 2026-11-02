import { route } from '@/lib/api/route'
import { STUDENT_VIEWER_ROLES } from '@/config/roles'
import { StudentListQuerySchema, listStudents } from '@/features/admin/students'
import { toApiError } from '@/features/admin/server-utils'

/** GET /api/admin/students?q=&role=&onboarding=&suspended=&page=&pageSize= */
export const GET = route({
  auth: STUDENT_VIEWER_ROLES,
  query: StudentListQuerySchema,
  handler: async ({ db, query }) => {
    try {
      const { rows, total } = await listStudents(db, query)
      return { rows, total, page: query.page, pageSize: query.pageSize }
    } catch (err) {
      throw toApiError(err)
    }
  },
})
