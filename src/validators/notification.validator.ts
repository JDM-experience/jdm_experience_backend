import { z } from 'zod'

const notificationTypeEnum = z.enum([
  'BOOKING_CONFIRMED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_REJECTED',
  'CANCELLATION_REQUEST_APPROVED',
  'CANCELLATION_REQUEST_REJECTED',
  'REFUND_COMPLETED',
  'TOUR_UPDATED',
  'SYSTEM',
])

export const notificationIdParamSchema = z.object({ id: z.coerce.number().int().positive() })

export const notificationListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
})

const notificationSchema = z
  .object({
    id: z.number().meta({ example: 1 }),
    type: notificationTypeEnum.meta({ example: 'BOOKING_CONFIRMED' }),
    title: z.string().meta({ example: 'Booking confirmed' }),
    message: z.string().meta({ example: 'Your booking JDM-12 for Mt. Fuji Tour has been confirmed.' }),
    relatedEntityType: z.string().nullable().meta({ example: 'booking' }),
    relatedEntityId: z.number().nullable().meta({ example: 12 }),
    isRead: z.boolean().meta({ example: false }),
    readAt: z.string().nullable().meta({ example: null }),
    createdAt: z.string().meta({ example: '2026-08-11T10:26:53.912Z' }),
  })
  .meta({ id: 'Notification' })

const paginatedNotificationsSchema = z
  .object({
    items: z.array(notificationSchema),
    total: z.number().meta({ example: 5 }),
    page: z.number().meta({ example: 1 }),
    pageSize: z.number().meta({ example: 20 }),
  })
  .meta({ id: 'PaginatedNotifications' })

export const notificationsListResponseSchema = z
  .object({ success: z.literal(true), data: paginatedNotificationsSchema })
  .meta({ id: 'NotificationsListResponse' })

export const notificationResponseSchema = z
  .object({ success: z.literal(true), data: notificationSchema })
  .meta({ id: 'NotificationResponse' })

export const unreadCountResponseSchema = z
  .object({ success: z.literal(true), data: z.object({ count: z.number().meta({ example: 3 }) }) })
  .meta({ id: 'UnreadCountResponse' })

export const markAllReadResponseSchema = z
  .object({ success: z.literal(true), data: z.null() })
  .meta({ id: 'MarkAllReadResponse' })
