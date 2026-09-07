import { z } from 'zod'

const roleEnum = z.enum(['SUPER_ADMIN', 'ADMIN', 'TOUR_GUIDE', 'CUSTOMER'])
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be in YYYY-MM-DD format.')

export const auditLogIdParamSchema = z.object({ id: z.coerce.number().int().positive() })

export const auditLogListQuerySchema = z.object({
  userId: z.coerce.number().int().positive().optional(),
  role: roleEnum.optional(),
  // Contains-match, case-insensitive -- action strings are dotted (e.g. "tour.update"),
  // so a search for "tour" or "update" both work, not just an exact string.
  action: z.string().trim().max(100).optional(),
  entity: z.string().trim().max(100).optional(),
  dateFrom: dateOnly.optional(),
  dateTo: dateOnly.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
})

const auditLogSchema = z
  .object({
    id: z.number().meta({ example: 1 }),
    userId: z.number().nullable().meta({ example: 3 }),
    userName: z.string().nullable().meta({ example: 'Jane Doe' }),
    userEmail: z.string().nullable().meta({ example: 'jane@example.com' }),
    role: roleEnum.nullable().meta({ example: 'ADMIN' }),
    action: z.string().meta({ example: 'tour.update' }),
    entity: z.string().meta({ example: 'tours' }),
    entityId: z.number().nullable().meta({ example: 1 }),
    metadata: z.unknown().nullable().meta({ example: { price: { from: 50000, to: 55000 } } }),
    createdAt: z.string().meta({ example: '2026-08-11T10:26:53.912Z' }),
  })
  .meta({ id: 'AuditLog' })

export const auditLogResponseSchema = z
  .object({ success: z.literal(true), data: auditLogSchema })
  .meta({ id: 'AuditLogResponse' })

const paginatedAuditLogsSchema = z
  .object({
    items: z.array(auditLogSchema),
    total: z.number().meta({ example: 42 }),
    page: z.number().meta({ example: 1 }),
    pageSize: z.number().meta({ example: 20 }),
  })
  .meta({ id: 'PaginatedAuditLogs' })

export const auditLogsListResponseSchema = z
  .object({ success: z.literal(true), data: paginatedAuditLogsSchema })
  .meta({ id: 'AuditLogsListResponse' })
