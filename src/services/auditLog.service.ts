import { prisma } from '../config/prisma'
import type { Prisma } from '../generated/prisma/client'

/**
 * Records a sensitive administrative action. Called only from the handful of write paths that
 * warrant it (role changes, user delete/deactivate, tour delete, guide reassignment, settings
 * edits) -- not every request. Never pass passwords/secrets in `metadata`.
 */
export async function recordAuditLog(params: {
  userId: number | null
  action: string
  entity: string
  entityId?: number | null
  metadata?: Record<string, unknown>
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId ?? null,
      metadata: (params.metadata as Prisma.InputJsonValue) ?? undefined,
    },
  })
}
