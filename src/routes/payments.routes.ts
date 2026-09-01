import { listForBooking, record } from '../controllers/payment.controller'
import { requireAuth } from '../middleware/auth.middleware'
import { requireRole } from '../middleware/rbac'
import { validateBody } from '../middleware/validate'
import { apiErrorResponseSchema } from '../validators/common.validator'
import { paymentResponseSchema, paymentsListResponseSchema, recordPaymentSchema } from '../validators/payment.validator'
import type { RouteDefinition } from './route-definition'

// Every /payments route requires auth.
export const paymentsRoutes: RouteDefinition[] = [
  {
    method: 'post',
    path: '/payments',
    handler: [requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), validateBody(recordPaymentSchema), record],
    summary: 'Record a payment against a booking',
    description: 'No payment gateway is wired up yet -- this is the schema/service ready for one to plug into. Never persists card numbers/CVVs.',
    request: { body: recordPaymentSchema },
    responses: {
      201: { description: 'Payment recorded.', schema: paymentResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN or ADMIN.', schema: apiErrorResponseSchema },
      404: { description: 'No booking with that id.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
  // Ownership (staff or the booking's own customer) is enforced inside payment.service.ts.
  {
    method: 'get',
    path: '/payments/booking/:bookingId',
    handler: [requireAuth, listForBooking],
    summary: 'List payments for a booking',
    responses: {
      200: { description: 'Payments, newest first.', schema: paymentsListResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not the booking’s owner or staff.', schema: apiErrorResponseSchema },
      404: { description: 'No booking with that id.', schema: apiErrorResponseSchema },
    },
  },
]
