import type { Request, Response, NextFunction } from 'express'
import { ApiError } from '../middleware/errorHandler'
import * as notificationService from '../services/notification.service'
import { notificationIdParamSchema } from '../validators/notification.validator'

function parseId(req: Request): number {
  const parsed = notificationIdParamSchema.safeParse(req.params)
  if (!parsed.success) throw new ApiError(400, 'id must be a positive integer.')
  return parsed.data.id
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const page = req.query.page as unknown as number | undefined
    const pageSize = req.query.pageSize as unknown as number | undefined
    res.json({ success: true, data: await notificationService.listMyNotifications(req.user!.userId, page, pageSize) })
  } catch (error) {
    next(error)
  }
}

export async function unreadCount(req: Request, res: Response, next: NextFunction) {
  try {
    const count = await notificationService.getUnreadCount(req.user!.userId)
    res.json({ success: true, data: { count } })
  } catch (error) {
    next(error)
  }
}

export async function markRead(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await notificationService.markAsRead(req.user!.userId, parseId(req)) })
  } catch (error) {
    next(error)
  }
}

export async function markAllRead(req: Request, res: Response, next: NextFunction) {
  try {
    await notificationService.markAllAsRead(req.user!.userId)
    res.json({ success: true, data: null })
  } catch (error) {
    next(error)
  }
}
