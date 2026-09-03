import { create, getOne, list, remove, update } from '../controllers/paymentMethod.controller'
import { requireAuth } from '../middleware/auth.middleware'
import { requireRole } from '../middleware/rbac'
import { validateBody } from '../middleware/validate'
import { apiErrorResponseSchema } from '../validators/common.validator'
import {
  createPaymentMethodSchema,
  deletePaymentMethodResponseSchema,
  paymentMethodResponseSchema,
  paymentMethodsListResponseSchema,
  updatePaymentMethodSchema,
} from '../validators/paymentMethod.validator'
import type { RouteDefinition } from './route-definition'

const superAdminOnly = [requireAuth, requireRole('SUPER_ADMIN')]

export const paymentMethodsRoutes: RouteDefinition[] = [
  {
    method: 'get',
    path: '/payment-methods',
    handler: [requireAuth, list],
    summary: 'List payment methods (customers see active only; staff see all)',
    responses: {
      200: { description: 'Payment methods.', schema: paymentMethodsListResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'get',
    path: '/payment-methods/:id',
    handler: [requireAuth, getOne],
    summary: 'Get a payment method by id',
    responses: {
      200: { description: 'The payment method.', schema: paymentMethodResponseSchema },
      400: { description: 'id was not a positive integer.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      404: { description: 'No payment method with that id.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'post',
    path: '/payment-methods',
    handler: [...superAdminOnly, validateBody(createPaymentMethodSchema), create],
    summary: 'Create a payment method (SUPER_ADMIN only)',
    request: { body: createPaymentMethodSchema },
    responses: {
      201: { description: 'Payment method created.', schema: paymentMethodResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'put',
    path: '/payment-methods/:id',
    handler: [...superAdminOnly, validateBody(updatePaymentMethodSchema), update],
    summary: 'Update a payment method (SUPER_ADMIN only)',
    request: { body: updatePaymentMethodSchema },
    responses: {
      200: { description: 'Payment method updated.', schema: paymentMethodResponseSchema },
      400: { description: 'id was not a positive integer.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN.', schema: apiErrorResponseSchema },
      404: { description: 'No payment method with that id.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'delete',
    path: '/payment-methods/:id',
    handler: [...superAdminOnly, remove],
    summary: 'Delete a payment method (SUPER_ADMIN only)',
    description: 'Hard delete -- bookings that used it keep their history (paymentMethodId becomes null).',
    responses: {
      200: { description: 'Payment method deleted.', schema: deletePaymentMethodResponseSchema },
      400: { description: 'id was not a positive integer.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN.', schema: apiErrorResponseSchema },
      404: { description: 'No payment method with that id.', schema: apiErrorResponseSchema },
    },
  },
]
