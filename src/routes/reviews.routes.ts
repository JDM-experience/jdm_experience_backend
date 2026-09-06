import { create, getOne, listForTour, listMine, remove, update } from '../controllers/review.controller'
import { requireAuth } from '../middleware/auth.middleware'
import { validateBody } from '../middleware/validate'
import { apiErrorResponseSchema } from '../validators/common.validator'
import {
  createReviewSchema,
  deleteReviewResponseSchema,
  myReviewsListResponseSchema,
  reviewResponseSchema,
  reviewsListResponseSchema,
  updateReviewSchema,
} from '../validators/review.validator'
import type { RouteDefinition } from './route-definition'

// Ownership/eligibility (booking must be COMPLETED for this exact tour, and edit/delete is
// owner-or-staff only) is enforced inside review.service.ts, not by route middleware -- there is
// no per-review role that could be checked before loading the row, same pattern as
// verifyBookingOwnership's underlying checks in booking.service.ts.
export const reviewsRoutes: RouteDefinition[] = [
  {
    method: 'get',
    path: '/tours/:tourId/reviews',
    handler: listForTour,
    summary: "List a tour's reviews, plus its average rating and review count",
    responses: {
      200: { description: 'Reviews for this tour.', schema: reviewsListResponseSchema },
    },
  },
  {
    method: 'post',
    path: '/tours/:tourId/reviews',
    handler: [requireAuth, validateBody(createReviewSchema), create],
    summary: 'Create a review for a tour',
    description:
      'The authenticated user must have a COMPLETED booking for this exact tour -- verified ' +
      'server-side regardless of what the UI showed. userId is always taken from the auth token, ' +
      'never the request body. One review per user per tour (409 if one already exists).',
    request: { body: createReviewSchema },
    responses: {
      201: { description: 'Review created.', schema: reviewResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'No COMPLETED booking for this tour.', schema: apiErrorResponseSchema },
      404: { description: 'Tour not found.', schema: apiErrorResponseSchema },
      409: { description: 'A review by this user for this tour already exists.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'get',
    path: '/reviews/mine',
    handler: [requireAuth, listMine],
    summary: "List the calling user's own reviews across every tour",
    description:
      'Lets a page listing several of the customer\'s bookings (e.g. My Reservations) show ' +
      '"Leave a Review" vs "View Review" per booking without a separate call per tour.',
    responses: {
      200: { description: "The caller's reviews.", schema: myReviewsListResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'get',
    path: '/reviews/:id',
    handler: getOne,
    summary: 'Get a single review by id',
    responses: {
      200: { description: 'The review.', schema: reviewResponseSchema },
      404: { description: 'No review with that id.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'put',
    path: '/reviews/:id',
    handler: [requireAuth, validateBody(updateReviewSchema), update],
    summary: 'Update a review',
    description: "Review owner, or SUPER_ADMIN/ADMIN. userId and tourId can never be changed.",
    request: { body: updateReviewSchema },
    responses: {
      200: { description: 'Review updated.', schema: reviewResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not the review owner, and not staff.', schema: apiErrorResponseSchema },
      404: { description: 'No review with that id.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'delete',
    path: '/reviews/:id',
    handler: [requireAuth, remove],
    summary: 'Delete a review',
    description: 'Review owner, or SUPER_ADMIN/ADMIN.',
    responses: {
      200: { description: 'Review deleted.', schema: deleteReviewResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not the review owner, and not staff.', schema: apiErrorResponseSchema },
      404: { description: 'No review with that id.', schema: apiErrorResponseSchema },
    },
  },
]
