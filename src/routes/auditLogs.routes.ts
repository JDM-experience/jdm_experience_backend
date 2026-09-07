import { getOne, list } from '../controllers/auditLog.controller'
import { requireAuth } from '../middleware/auth.middleware'
import { requireRole } from '../middleware/rbac'
import { validateQuery } from '../middleware/validate'
import { apiErrorResponseSchema } from '../validators/common.validator'
import { auditLogListQuerySchema, auditLogResponseSchema, auditLogsListResponseSchema } from '../validators/auditLog.validator'
import type { RouteDefinition } from './route-definition'

// SUPER_ADMIN/ADMIN only -- Customers and Tour Guides must never see the audit trail. Read-only:
// deliberately no PATCH/DELETE routes here (audit logs are append-only, written only via
// recordAuditLog from within other services, never edited after the fact).
export const auditLogsRoutes: RouteDefinition[] = [
  {
    method: 'get',
    path: '/audit-logs',
    handler: [requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), validateQuery(auditLogListQuerySchema), list],
    summary: 'List audit log entries (SUPER_ADMIN/ADMIN only)',
    description:
      'Filterable by userId/role/action (contains-match)/entity/dateFrom/dateTo, paginated ' +
      '(page/pageSize, default 20, max 100 per page). Newest first.',
    request: { query: auditLogListQuerySchema },
    responses: {
      200: { description: 'Audit log entries.', schema: auditLogsListResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN or ADMIN.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'get',
    path: '/audit-logs/:id',
    handler: [requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), getOne],
    summary: 'Get a single audit log entry by id (SUPER_ADMIN/ADMIN only)',
    responses: {
      200: { description: 'The audit log entry.', schema: auditLogResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN or ADMIN.', schema: apiErrorResponseSchema },
      404: { description: 'No audit log entry with that id.', schema: apiErrorResponseSchema },
    },
  },
]
