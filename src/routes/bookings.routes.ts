import { create, getOne, list, myBookings, update } from '../controllers/booking.controller'
import { addProof, listProofs } from '../controllers/payment.controller'
import { requireAuth } from '../middleware/auth.middleware'
import { requireRole, verifyBookingOwnership } from '../middleware/rbac'
import { validateBody } from '../middleware/validate'
import { apiErrorResponseSchema } from '../validators/common.validator'
import { bookingResponseSchema, bookingsListResponseSchema, createBookingSchema, updateBookingSchema } from '../validators/booking.validator'
import { paymentProofResponseSchema, paymentProofSchema, paymentProofsListResponseSchema } from '../validators/payment.validator'
import type { RouteDefinition } from './route-definition'

// Every /bookings route requires auth -- there is no guest/anonymous booking.
export const bookingsRoutes: RouteDefinition[] = [
  {
    method: 'post',
    path: '/bookings',
    handler: [requireAuth, validateBody(createBookingSchema), create],
    summary: 'Create a booking (checkout) -- contact info, payment method, and payment proof required',
    description:
      'The checkout page\'s final submit -- creates the Booking and its first PaymentProof together ' +
      'in one transaction (paymentStatus starts at PENDING, never a proof-less UNPAID row), then ' +
      'notifies SUPER_ADMIN/ADMIN/the tour owner. Re-validates the JST same-day cutoff, the tour\'s ' +
      'seat cap, that the date has no CONFIRMED booking yet, and that paymentMethodId is still a ' +
      'real, active payment method (never trusts what the checkout page showed the customer -- it ' +
      'may have been disabled/deleted since). A tour-date is exclusive to one CONFIRMED booking at ' +
      'a time, but two PENDING requests for the same date may coexist until staff confirms one (see ' +
      'PUT /bookings/:id) — see GET /tours/:tourId/booked-dates for the customer-facing disabled-dates list.',
    request: { body: createBookingSchema },
    responses: {
      201: { description: 'Booking created.', schema: bookingResponseSchema },
      400: {
        description: "Booking closed for today, participants exceeds the tour's seats, or the payment method is no longer available.",
        schema: apiErrorResponseSchema,
      },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      404: { description: 'Tour not available for booking.', schema: apiErrorResponseSchema },
      409: { description: 'This date is already booked (CONFIRMED) for this tour.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed (missing contact info, payment method, or payment proof).', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'get',
    path: '/bookings/my-bookings',
    handler: [requireAuth, myBookings],
    summary: "List the calling user's own bookings",
    responses: {
      200: { description: 'The caller\'s bookings, newest first.', schema: bookingsListResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'get',
    path: '/bookings',
    handler: [requireAuth, requireRole('SUPER_ADMIN', 'ADMIN', 'TOUR_GUIDE'), list],
    summary: 'List bookings (staff see all; a guide sees only their own tours’ bookings)',
    responses: {
      200: { description: 'Bookings, newest first.', schema: bookingsListResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN, ADMIN, or TOUR_GUIDE.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'get',
    path: '/bookings/:id',
    handler: [requireAuth, verifyBookingOwnership, getOne],
    summary: 'Get a booking by id',
    responses: {
      200: { description: 'The booking.', schema: bookingResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not the owner, assigned guide, or staff.', schema: apiErrorResponseSchema },
      404: { description: 'No booking with that id.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'put',
    path: '/bookings/:id',
    handler: [
      requireAuth,
      requireRole('SUPER_ADMIN', 'ADMIN', 'TOUR_GUIDE'),
      verifyBookingOwnership,
      validateBody(updateBookingSchema),
      update,
    ],
    summary: 'Update a booking’s status/paymentStatus',
    description:
      'Setting status to CONFIRMED always sets paymentStatus to PAID in the same update, ' +
      'regardless of what paymentStatus (if anything) was sent -- a booking can never be left ' +
      'CONFIRMED with a stale/PENDING paymentStatus. Requires at least one payment proof to exist ' +
      'and rejects an already-CONFIRMED booking (no duplicate confirmations/emails). Setting status ' +
      'to CANCELLED defaults paymentStatus to FAILED unless the booking was already PAID/REFUNDED ' +
      'or a different paymentStatus was explicitly provided. This is also where per-date ' +
      'exclusivity is enforced: rejected if another booking on the same tour+date is already CONFIRMED.',
    request: { body: updateBookingSchema },
    responses: {
      200: { description: 'Booking updated.', schema: bookingResponseSchema },
      400: {
        description: 'Already confirmed/cancelled, or confirming a booking with no payment proof.',
        schema: apiErrorResponseSchema,
      },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not staff or the assigned guide.', schema: apiErrorResponseSchema },
      404: { description: 'No booking with that id.', schema: apiErrorResponseSchema },
      409: { description: 'Another booking for this tour and date is already CONFIRMED.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
  // Ownership (staff or the booking's own customer) is enforced inside payment.service.ts.
  {
    method: 'post',
    path: '/bookings/:id/payment-proof',
    handler: [requireAuth, validateBody(paymentProofSchema), addProof],
    summary: 'Attach payment-proof metadata to a booking (by URL)',
    request: { body: paymentProofSchema },
    responses: {
      201: { description: 'Payment proof recorded.', schema: paymentProofResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not the booking’s owner or staff.', schema: apiErrorResponseSchema },
      404: { description: 'No booking with that id.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'get',
    path: '/bookings/:id/payment-proof',
    handler: [requireAuth, listProofs],
    summary: 'List payment-proof metadata for a booking',
    responses: {
      200: { description: 'Payment proofs, newest first.', schema: paymentProofsListResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not the booking’s owner or staff.', schema: apiErrorResponseSchema },
      404: { description: 'No booking with that id.', schema: apiErrorResponseSchema },
    },
  },
]
