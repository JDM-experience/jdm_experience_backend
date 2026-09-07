import { prisma } from '../config/prisma'
import { ApiError } from '../middleware/errorHandler'
import type { Notification, NotificationType } from '../generated/prisma/client'

function toPublicNotification(row: Notification) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    relatedEntityType: row.relatedEntityType,
    relatedEntityId: row.relatedEntityId,
    isRead: row.isRead,
    readAt: row.readAt,
    createdAt: row.createdAt,
  }
}

/**
 * Generated only by backend business events (see the call sites in booking.service.ts and
 * cancellationRequest.service.ts) -- never created directly from the frontend. Always
 * fire-and-forget, placed right next to the equivalent email call for the same event, and never
 * allowed to block or replace it (mirrors how every email send in this app already works).
 */
export async function createNotification(input: {
  userId: number
  type: NotificationType
  title: string
  message: string
  relatedEntityType?: string
  relatedEntityId?: number
}): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
    },
  })
}

/** Always scoped to the caller's own notifications -- ownership is structural (every query keys
 *  on userId), same pattern as wishlist.service.ts. */
export async function listMyNotifications(userId: number, page = 1, pageSize = 20) {
  const [rows, total] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notification.count({ where: { userId } }),
  ])
  return { items: rows.map(toPublicNotification), total, page, pageSize }
}

/** Powers the navbar badge -- polled on an interval rather than the full list, so a live count
 *  never requires re-fetching every notification just to know how many are unread. */
export async function getUnreadCount(userId: number): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } })
}

export async function markAsRead(userId: number, id: number) {
  const existing = await prisma.notification.findUnique({ where: { id } })
  if (!existing || existing.userId !== userId) throw new ApiError(404, 'Notification not found.')

  const updated = await prisma.notification.update({
    where: { id },
    data: { isRead: true, readAt: existing.isRead ? existing.readAt : new Date() },
  })
  return toPublicNotification(updated)
}

export async function markAllAsRead(userId: number): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  })
}
