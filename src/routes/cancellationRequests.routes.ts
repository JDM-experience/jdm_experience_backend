import { addRefundProof, approve, complete, create, getOne, list, mine, reject } from '../controllers/cancellationRequest.controller'
import { requireAuth } from '../middleware/auth.middleware'
import { requireRole, verifyCancellationRequestOwnership } from '../middleware/rbac'
import { validateBody, validateQuery } from '../middleware/validate'
import { apiErrorResponseSchema } from '../validators/common.validator'
import {
  cancellationRequestListQuerySchema,
  cancellationRequestResponseSchema,
  cancellationRequestsListResponseSchema,
  createCancellationRequestSchema,
  refundProofSchema,
  rejectCancellationRequestSchema,
} from '../validators/cancellationRequest.validator'
import type { RouteDefinition } from './route-definition'

// The paid-booking cancellation + refund workflow -- distinct from PATCH /bookings/:id/cancel,
// which only ever applies to a still-PENDING+UNPAID booking and cancels it immediately with no
// review step. Every route requires auth; staff-only routes are SUPER_ADMIN/ADMIN, never
// TOUR_GUIDE (refund destination details are staff-sensitive, and this workflow never assigns
// work to guides).
export const cancellationRequestsRoutes: RouteDefinition[] = [
  {
    method: 'post',
    path: '/cancellation-requests',
    handler: [requireAuth, validateBody(createCancellationRequestSchema), create],
    summary: 'Request cancellation + refund of a paid booking',
    description:
      'Customer self-service. Rejected unless the booking belongs to the caller, its paymentStatus ' +
      'is PAID, it is not already CANCELLED/COMPLETED, no cancellation request already exists for ' +
      'it, and the current time is more than 24 hours before the booking date (Japan Standard ' +
      'Time, enforced here regardless of what the client believes) -- exactly 24 hours counts as ' +
      'NOT eligible. refundMethodId must reference an existing, active payment method. Never ' +
      'transitions the booking itself -- it stays CONFIRMED/PAID while the request is reviewed. ' +
      'Emails the customer an acknowledgement and notifies SUPER_ADMIN/ADMIN/the tour\'s guide.',
    request: { body: createCancellationRequestSchema },
    responses: {
      201: { description: 'Cancellation request created.', schema: cancellationRequestResponseSchema },
      400: {
        description: 'Not paid, already cancelled/completed, within 24 hours, or the refund method is unavailable.',
        schema: apiErrorResponseSchema,
      },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not this booking\'s own customer.', schema: apiErrorResponseSchema },
      404: { description: 'No booking with that id.', schema: apiErrorResponseSchema },
      409: { description: 'A cancellation request already exists for this booking.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'get',
    path: '/cancellation-requests/mine',
    handler: [requireAuth, mine],
    summary: "List the calling customer's own cancellation requests",
    responses: {
      200: { description: "The caller's cancellation requests, newest first.", schema: cancellationRequestsListResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'get',
    path: '/cancellation-requests',
    handler: [requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), validateQuery(cancellationRequestListQuerySchema), list],
    summary: 'List cancellation requests (SUPER_ADMIN/ADMIN only)',
    request: { query: cancellationRequestListQuerySchema },
    responses: {
      200: { description: 'Cancellation requests, newest first.', schema: cancellationRequestsListResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN or ADMIN.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'get',
    path: '/cancellation-requests/:id',
    handler: [requireAuth, verifyCancellationRequestOwnership, getOne],
    summary: 'Get a cancellation request by id',
    responses: {
      200: { description: 'The cancellation request.', schema: cancellationRequestResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN/ADMIN or this request\'s own customer.', schema: apiErrorResponseSchema },
      404: { description: 'No cancellation request with that id.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'patch',
    path: '/cancellation-requests/:id/approve',
    handler: [requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), approve],
    summary: 'Approve a pending cancellation request (SUPER_ADMIN/ADMIN only)',
    description: 'Only allowed from PENDING. Never touches the Booking -- it stays CONFIRMED/PAID until the refund is actually completed.',
    responses: {
      200: { description: 'Cancellation request approved.', schema: cancellationRequestResponseSchema },
      400: { description: 'Not currently PENDING.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN or ADMIN.', schema: apiErrorResponseSchema },
      404: { description: 'No cancellation request with that id.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'patch',
    path: '/cancellation-requests/:id/reject',
    handler: [requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), validateBody(rejectCancellationRequestSchema), reject],
    summary: 'Reject a pending cancellation request (SUPER_ADMIN/ADMIN only)',
    description: 'Only allowed from PENDING. Requires a rejectionReason. The booking is left untouched and remains active. Emails the customer.',
    request: { body: rejectCancellationRequestSchema },
    responses: {
      200: { description: 'Cancellation request rejected.', schema: cancellationRequestResponseSchema },
      400: { description: 'Not currently PENDING.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN or ADMIN.', schema: apiErrorResponseSchema },
      404: { description: 'No cancellation request with that id.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed (missing rejectionReason).', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'post',
    path: '/cancellation-requests/:id/refund-proof',
    handler: [requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), validateBody(refundProofSchema), addRefundProof],
    summary: 'Attach refund-proof metadata (SUPER_ADMIN/ADMIN only)',
    description: 'Only allowed once APPROVED (or again, replacing the proof, while REFUND_PROCESSING). Moves the request to REFUND_PROCESSING.',
    request: { body: refundProofSchema },
    responses: {
      201: { description: 'Refund proof recorded.', schema: cancellationRequestResponseSchema },
      400: { description: 'Not currently APPROVED or REFUND_PROCESSING.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN or ADMIN.', schema: apiErrorResponseSchema },
      404: { description: 'No cancellation request with that id.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'patch',
    path: '/cancellation-requests/:id/complete',
    handler: [requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), complete],
    summary: 'Mark a refund as completed (SUPER_ADMIN/ADMIN only)',
    description:
      'Only allowed once refund proof has been uploaded (REFUND_PROCESSING). Sets the request to ' +
      'REFUNDED and, in the same action, transitions the Booking to status=CANCELLED, ' +
      'paymentStatus=REFUNDED (via the same updateBookingStatus used everywhere else booking ' +
      'status changes). Emails the customer the refund confirmation.',
    responses: {
      200: { description: 'Refund marked completed; booking cancelled/refunded.', schema: cancellationRequestResponseSchema },
      400: { description: 'Refund proof has not been uploaded yet.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN or ADMIN.', schema: apiErrorResponseSchema },
      404: { description: 'No cancellation request with that id.', schema: apiErrorResponseSchema },
    },
  },
]
