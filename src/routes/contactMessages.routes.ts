import rateLimit from 'express-rate-limit'
import { getOne, list, remove, submit, update } from '../controllers/contactMessage.controller'
import { requireAuth } from '../middleware/auth.middleware'
import { requireRole } from '../middleware/rbac'
import { validateBody } from '../middleware/validate'
import { apiErrorResponseSchema } from '../validators/common.validator'
import {
  contactMessageResponseSchema,
  contactMessagesListResponseSchema,
  createContactMessageSchema,
  deleteContactMessageResponseSchema,
  updateContactMessageSchema,
} from '../validators/contactMessage.validator'
import type { RouteDefinition } from './route-definition'

const submitLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false })
const staffOnly = [requireAuth, requireRole('SUPER_ADMIN', 'ADMIN')]

export const contactMessagesRoutes: RouteDefinition[] = [
  {
    method: 'post',
    path: '/contact',
    handler: [submitLimiter, validateBody(createContactMessageSchema), submit],
    summary: 'Submit a contact message',
    description: 'Public, no auth required. Rate-limited to 10 requests / 15 min per IP.',
    request: { body: createContactMessageSchema },
    responses: {
      201: { description: 'Message submitted.', schema: contactMessageResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
      429: { description: 'Rate limit exceeded.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'get',
    path: '/contact',
    handler: staffOnly.concat(list),
    summary: 'List contact messages',
    responses: {
      200: { description: 'All contact messages, newest first.', schema: contactMessagesListResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN or ADMIN.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'get',
    path: '/contact/:id',
    handler: staffOnly.concat(getOne),
    summary: 'Get a contact message by id',
    responses: {
      200: { description: 'The contact message.', schema: contactMessageResponseSchema },
      400: { description: 'id was not a positive integer.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN or ADMIN.', schema: apiErrorResponseSchema },
      404: { description: 'No message with that id.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'put',
    path: '/contact/:id',
    handler: staffOnly.concat([validateBody(updateContactMessageSchema), update]),
    summary: 'Update a contact message status',
    request: { body: updateContactMessageSchema },
    responses: {
      200: { description: 'Message updated.', schema: contactMessageResponseSchema },
      400: { description: 'id was not a positive integer.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN or ADMIN.', schema: apiErrorResponseSchema },
      404: { description: 'No message with that id.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'delete',
    path: '/contact/:id',
    handler: staffOnly.concat(remove),
    summary: 'Delete a contact message',
    responses: {
      200: { description: 'Message deleted.', schema: deleteContactMessageResponseSchema },
      400: { description: 'id was not a positive integer.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN or ADMIN.', schema: apiErrorResponseSchema },
      404: { description: 'No message with that id.', schema: apiErrorResponseSchema },
    },
  },
]
