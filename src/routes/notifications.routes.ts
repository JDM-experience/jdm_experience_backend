import { list, markAllRead, markRead, unreadCount } from '../controllers/notification.controller'
import { requireAuth } from '../middleware/auth.middleware'
import { validateQuery } from '../middleware/validate'
import { apiErrorResponseSchema } from '../validators/common.validator'
import {
  markAllReadResponseSchema,
  notificationListQuerySchema,
  notificationResponseSchema,
  notificationsListResponseSchema,
  unreadCountResponseSchema,
} from '../validators/notification.validator'
import type { RouteDefinition } from './route-definition'

// Live website notifications -- generated only by backend business events (see the
// createNotification call sites in booking.service.ts/payment.service.ts/
// cancellationRequest.service.ts), never created from the frontend. Every route requires auth;
// ownership is structural (every query/mutation is scoped to req.user.userId), same pattern as
// GET /wishlist -- no separate role restriction, any authenticated user has their own.
export const notificationsRoutes: RouteDefinition[] = [
  {
    method: 'get',
    path: '/notifications',
    handler: [requireAuth, validateQuery(notificationListQuerySchema), list],
    summary: "List the calling user's own notifications, newest first",
    request: { query: notificationListQuerySchema },
    responses: {
      200: { description: "The caller's notifications.", schema: notificationsListResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'get',
    path: '/notifications/unread-count',
    handler: [requireAuth, unreadCount],
    summary: "The calling user's unread notification count",
    description: 'Powers the navbar badge -- polled on an interval rather than re-fetching the full list.',
    responses: {
      200: { description: 'Unread count.', schema: unreadCountResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'patch',
    path: '/notifications/:id/read',
    handler: [requireAuth, markRead],
    summary: 'Mark one notification as read',
    responses: {
      200: { description: 'Notification marked read.', schema: notificationResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      404: { description: "No notification with that id belonging to the caller.", schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'patch',
    path: '/notifications/read-all',
    handler: [requireAuth, markAllRead],
    summary: "Mark all of the caller's notifications as read",
    responses: {
      200: { description: 'All notifications marked read.', schema: markAllReadResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
    },
  },
]
