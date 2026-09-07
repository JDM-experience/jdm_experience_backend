import { prisma } from '../config/prisma'
import { ApiError } from '../middleware/errorHandler'
import { Prisma, type Role } from '../generated/prisma/client'

/**
 * Records a sensitive administrative action. Called only from the handful of write paths that
 * warrant it (role changes, user delete/deactivate, tour delete, guide reassignment, settings
 * edits, ...) -- not every request. Never pass passwords/secrets in `metadata`.
 *
 * `role` is a snapshot of the actor's role *at the time of the action* -- stored directly rather
 * than joined live from User.role, so a later promotion/demotion never rewrites what an old audit
 * entry says the actor's role was.
 */
export async function recordAuditLog(params: {
  userId: number | null
  role?: Role | null
  action: string
  entity: string
  entityId?: number | null
  metadata?: Record<string, unknown>
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: params.userId,
      role: params.role ?? null,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId ?? null,
      metadata: (params.metadata as Prisma.InputJsonValue) ?? undefined,
    },
  })
}

const AUDIT_LOG_INCLUDE = { user: { select: { fullName: true, email: true } } } as const
type AuditLogWithUser = Prisma.AuditLogGetPayload<{ include: typeof AUDIT_LOG_INCLUDE }>

function toPublicAuditLog(row: AuditLogWithUser) {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.user?.fullName ?? null,
    userEmail: row.user?.email ?? null,
    role: row.role,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    metadata: row.metadata,
    createdAt: row.createdAt,
  }
}

export interface AuditLogFilter {
  userId?: number
  role?: Role
  action?: string
  entity?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

/**
 * The first paginated list endpoint in this app -- justified because, unlike tours/bookings
 * (small, naturally-capped tables), an audit trail grows unboundedly and has no reasonable "just
 * fetch them all" ceiling. `page`/`pageSize` are already coerced/bounded by
 * auditLog.validator.ts's auditLogListQuerySchema before reaching here.
 */
export async function listAuditLogs(filter?: AuditLogFilter) {
  const where: Prisma.AuditLogWhereInput = {}
  if (filter?.userId) where.userId = filter.userId
  if (filter?.role) where.role = filter.role
  if (filter?.action) where.action = { contains: filter.action, mode: 'insensitive' }
  if (filter?.entity) where.entity = filter.entity
  if (filter?.dateFrom || filter?.dateTo) {
    where.createdAt = {
      ...(filter.dateFrom ? { gte: new Date(`${filter.dateFrom}T00:00:00.000Z`) } : {}),
      ...(filter.dateTo ? { lte: new Date(`${filter.dateTo}T23:59:59.999Z`) } : {}),
    }
  }

  const page = filter?.page ?? 1
  const pageSize = filter?.pageSize ?? 20

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: AUDIT_LOG_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ])

  return { items: rows.map(toPublicAuditLog), total, page, pageSize }
}

export async function getAuditLog(id: number) {
  const row = await prisma.auditLog.findUnique({ where: { id }, include: AUDIT_LOG_INCLUDE })
  if (!row) throw new ApiError(404, 'Audit log entry not found.')
  return toPublicAuditLog(row)
}
