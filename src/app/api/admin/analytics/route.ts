import { route } from '@/lib/api/route'
import { ADMIN_ROLES } from '@/config/roles'
import { getDashboardMetrics } from '@/features/admin/metrics'
import { toApiError } from '@/features/admin/server-utils'

/** GET /api/admin/analytics — overview KPIs from admin_dashboard_metrics() (user-scoped; SQL re-checks is_admin). */
export const GET = route({
  auth: ADMIN_ROLES,
  handler: async ({ db }) => {
    try {
      return { metrics: await getDashboardMetrics(db), generatedAt: new Date().toISOString() }
    } catch (err) {
      throw toApiError(err)
    }
  },
})
