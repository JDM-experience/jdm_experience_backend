import { getSummary } from '../controllers/dashboard.controller'
import { requireAuth } from '../middleware/auth.middleware'
import { requireRole } from '../middleware/rbac'
import { validateQuery } from '../middleware/validate'
import { apiErrorResponseSchema } from '../validators/common.validator'
import { dashboardSummaryQuerySchema, dashboardSummaryResponseSchema } from '../validators/dashboard.validator'
import type { RouteDefinition } from './route-definition'

export const dashboardRoutes: RouteDefinition[] = [
  {
    method: 'get',
    path: '/dashboard/summary',
    handler: [requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), validateQuery(dashboardSummaryQuerySchema), getSummary],
    summary: 'Sales, revenue, and tour-performance report',
    description:
      'Staff only (SUPER_ADMIN/ADMIN). Optional from/to (YYYY-MM-DD) filters by booking creation ' +
      'date; omit both for all-time. All aggregation happens server-side against the database -- ' +
      'the frontend never receives the underlying booking rows, only these computed totals. ' +
      'Revenue only ever counts paymentStatus=PAID bookings (never pending/unpaid/cancelled).',
    request: { query: dashboardSummaryQuerySchema },
    responses: {
      200: { description: 'Dashboard summary.', schema: dashboardSummaryResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN or ADMIN.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
]
