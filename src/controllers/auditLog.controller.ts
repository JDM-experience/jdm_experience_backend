import type { Request, Response, NextFunction } from 'express'
import { ApiError } from '../middleware/errorHandler'
import * as auditLogService from '../services/auditLog.service'
import { auditLogIdParamSchema } from '../validators/auditLog.validator'
import type { AuditLogFilter } from '../services/auditLog.service'

function parseId(req: Request): number {
  const parsed = auditLogIdParamSchema.safeParse(req.params)
  if (!parsed.success) throw new ApiError(400, 'id must be a positive integer.')
  return parsed.data.id
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const filter = req.query as unknown as AuditLogFilter
    res.json({ success: true, data: await auditLogService.listAuditLogs(filter) })
  } catch (error) {
    next(error)
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await auditLogService.getAuditLog(parseId(req)) })
  } catch (error) {
    next(error)
  }
}
