import {
  addImage,
  bookedDates,
  confirm,
  create,
  getContact,
  getOne,
  holdDate,
  list,
  listGuides,
  myTours,
  releaseDate,
  remove,
  removeImage,
  update,
  updateContact,
} from '../controllers/tour.controller'
import { requireAuth } from '../middleware/auth.middleware'
import { requireRole, verifyTourAssignment } from '../middleware/rbac'
import { validateBody, validateQuery } from '../middleware/validate'
import { apiErrorResponseSchema } from '../validators/common.validator'
import {
  addTourImageSchema,
  bookedDatesResponseSchema,
  createTourSchema,
  deleteTourImageResponseSchema,
  deleteTourResponseSchema,
  holdDateSchema,
  releaseDateResponseSchema,
  tourContactResponseSchema,
  tourContactSchema,
  tourDateHoldResponseSchema,
  tourGuidesListResponseSchema,
  tourImageResponseSchema,
  tourListQuerySchema,
  tourResponseSchema,
  toursListResponseSchema,
  updateTourSchema,
} from '../validators/tour.validator'
import type { RouteDefinition } from './route-definition'

const staffOrOwnGuide = [requireAuth, requireRole('SUPER_ADMIN', 'ADMIN', 'TOUR_GUIDE'), verifyTourAssignment]

export const toursRoutes: RouteDefinition[] = [
  // Public reads — anyone can browse tours, no auth required.
  {
    method: 'get',
    path: '/tours',
    handler: [validateQuery(tourListQuerySchema), list],
    summary: 'List tours',
    description:
      'Search (name/description, case-insensitive), price range, status, and sort are all ' +
      'performed by the database, not the client — see tour.service.ts. `sortBy` is whitelisted ' +
      '(name/price/seats/createdAt/status); defaults to id desc when omitted. `search` matches ' +
      'tours whose name or description contains the term. `minPrice`/`maxPrice` filter on `price` ' +
      '(inclusive); rejected with 422 if minPrice > maxPrice.',
    request: { query: tourListQuerySchema },
    responses: {
      200: { description: 'Tours, optionally filtered by status/search and sorted.', schema: toursListResponseSchema },
      422: { description: 'Invalid status/search/sortBy/sortOrder.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'get',
    path: '/tours/my-tours',
    handler: [requireAuth, requireRole('TOUR_GUIDE'), myTours],
    summary: "List the calling guide's own tours",
    responses: {
      200: { description: "The guide's tours.", schema: toursListResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not a TOUR_GUIDE.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'get',
    path: '/tours/guides',
    handler: [requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), listGuides],
    summary: 'List active tour guides, for the Create/Edit Tour guide-assignment selector',
    responses: {
      200: { description: 'Active tour guides.', schema: tourGuidesListResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN or ADMIN.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'get',
    path: '/tours/:id',
    handler: getOne,
    summary: 'Get a tour by id',
    responses: {
      200: { description: 'The tour.', schema: tourResponseSchema },
      400: { description: 'id was not a positive integer.', schema: apiErrorResponseSchema },
      404: { description: 'No tour with that id.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'get',
    path: '/tours/:tourId/booked-dates',
    handler: bookedDates,
    summary: "List a tour's future dates that are currently unavailable",
    description:
      'A date not in this list is bookable (subject to the tour\'s own status and the JST ' +
      'same-day cutoff) — powers the customer-facing date picker\'s disabled dates. A tour-date ' +
      'is exclusive to one active (PENDING or CONFIRMED) booking, or one unexpired hold, at a ' +
      'time; see POST /tours/:tourId/hold-date and POST /bookings.',
    responses: {
      200: { description: 'Unavailable dates (YYYY-MM-DD), soonest first.', schema: bookedDatesResponseSchema },
      400: { description: 'tourId was not a positive integer.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'post',
    path: '/tours/:tourId/hold-date',
    handler: [requireAuth, validateBody(holdDateSchema), holdDate],
    summary: 'Atomically reserve a tour date for the calling customer, temporarily',
    description:
      'Called the moment a customer selects a date on the Tour Details page, before checkout. ' +
      'Rejected with 409 if the date already has an active booking or another customer\'s ' +
      'unexpired hold -- enforced by a real database unique constraint, safe under a race between ' +
      'two customers selecting the same date at the same instant, not just a read-then-write ' +
      'check. The hold expires after a short TTL if checkout is never completed; re-holding the ' +
      'same date (e.g. reaching the checkout page) refreshes it. POST /bookings requires the ' +
      'caller to currently hold the date and consumes the hold when the booking is created.',
    request: { body: holdDateSchema },
    responses: {
      201: { description: 'Date held.', schema: tourDateHoldResponseSchema },
      400: { description: 'Booking closed for today, or the tour is not AVAILABLE.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      404: { description: 'No tour with that id, or not available for booking.', schema: apiErrorResponseSchema },
      409: { description: 'This date is currently unavailable.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'delete',
    path: '/tours/:tourId/hold-date',
    handler: [requireAuth, validateQuery(holdDateSchema), releaseDate],
    summary: "Release the calling customer's hold on a date, if any",
    description:
      'Best-effort/idempotent -- called when a customer picks a different date or navigates away ' +
      'without completing checkout, so the slot frees up sooner than the full TTL. bookingDate is ' +
      'a query parameter (?bookingDate=YYYY-MM-DD), not a body.',
    request: { query: holdDateSchema },
    responses: {
      200: { description: 'Hold released (or none existed).', schema: releaseDateResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
  // Staff, or a Tour Guide (auto-assigned as the tour's owner on create -- see tour.service.ts).
  {
    method: 'post',
    path: '/tours',
    handler: [requireAuth, requireRole('SUPER_ADMIN', 'ADMIN', 'TOUR_GUIDE'), validateBody(createTourSchema), create],
    summary: 'Create a tour',
    request: { body: createTourSchema },
    responses: {
      201: { description: 'Tour created.', schema: tourResponseSchema },
      400: { description: "Guide's tour-guide profile is not set up yet.", schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN, ADMIN, or TOUR_GUIDE.', schema: apiErrorResponseSchema },
      409: { description: 'Slug already in use.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
  // Delete (soft): Super Admin (any tour), or a Tour Guide deleting their own tour. Admin may
  // never delete a tour. requireRole runs first, so Admin is rejected before verifyTourAssignment
  // (which would otherwise also bypass Admin) ever executes.
  {
    method: 'delete',
    path: '/tours/:id',
    handler: [requireAuth, requireRole('SUPER_ADMIN', 'TOUR_GUIDE'), verifyTourAssignment, remove],
    summary: 'Delete a tour (soft delete)',
    responses: {
      200: { description: 'Tour deleted.', schema: deleteTourResponseSchema },
      400: { description: 'id was not a positive integer.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN, or not the assigned guide.', schema: apiErrorResponseSchema },
      404: { description: 'No tour with that id.', schema: apiErrorResponseSchema },
    },
  },
  // Confirmation: the one way a tour moves PENDING -> AVAILABLE. Staff-only, deliberately not
  // available through PUT /tours/:id (which also rejects a TOUR_GUIDE-supplied status, staff can
  // still hit either endpoint for a manual transition afterwards).
  {
    method: 'post',
    path: '/tours/:id/confirm',
    handler: [requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), confirm],
    summary: 'Confirm a PENDING tour, moving it to AVAILABLE',
    responses: {
      200: { description: 'Tour confirmed and now AVAILABLE.', schema: tourResponseSchema },
      400: { description: 'Tour is not PENDING.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN or ADMIN.', schema: apiErrorResponseSchema },
      404: { description: 'No tour with that id.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'put',
    path: '/tours/:id',
    handler: [...staffOrOwnGuide, validateBody(updateTourSchema), update],
    summary: 'Update a tour',
    description:
      'A Tour Guide may edit their own tour\'s name/description/price/seats/images, but not its ' +
      '`status` (staff-only — see POST /tours/:id/confirm and manual status changes) or `guideId` ' +
      '(cannot reassign to a different guide).',
    request: { body: updateTourSchema },
    responses: {
      200: { description: 'Tour updated.', schema: tourResponseSchema },
      400: { description: 'id was not a positive integer.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not staff or the assigned guide, or a guide tried to change status/guideId.', schema: apiErrorResponseSchema },
      404: { description: 'No tour with that id.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
  // Customer-facing contact info shown after a CONFIRMED booking (see booking.service.ts's
  // confirmation email). SUPER_ADMIN/ADMIN: any tour; TOUR_GUIDE: only their own tour.
  {
    method: 'get',
    path: '/tours/:id/contact',
    handler: [...staffOrOwnGuide, getContact],
    summary: "Get a tour's customer-facing contact info",
    responses: {
      200: { description: 'The contact info (fields are null until ever set).', schema: tourContactResponseSchema },
      400: { description: 'id was not a positive integer.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not staff or the assigned guide.', schema: apiErrorResponseSchema },
      404: { description: 'No tour with that id.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'put',
    path: '/tours/:id/contact',
    handler: [...staffOrOwnGuide, validateBody(tourContactSchema), updateContact],
    summary: "Update a tour's customer-facing contact info",
    request: { body: tourContactSchema },
    responses: {
      200: { description: 'Contact info updated.', schema: tourContactResponseSchema },
      400: { description: 'id was not a positive integer.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not staff or the assigned guide.', schema: apiErrorResponseSchema },
      404: { description: 'No tour with that id.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'post',
    path: '/tours/:tourId/images',
    handler: [...staffOrOwnGuide, validateBody(addTourImageSchema), addImage],
    summary: 'Add an image to a tour (by URL)',
    request: { body: addTourImageSchema },
    responses: {
      201: { description: 'Image added.', schema: tourImageResponseSchema },
      400: { description: 'tourId was not a positive integer.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not staff or the assigned guide.', schema: apiErrorResponseSchema },
      404: { description: 'No tour with that id.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'delete',
    path: '/tours/:tourId/images/:imageId',
    handler: [...staffOrOwnGuide, removeImage],
    summary: 'Remove a tour image',
    responses: {
      200: { description: 'Image removed.', schema: deleteTourImageResponseSchema },
      400: { description: 'tourId/imageId was not a positive integer.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not staff or the assigned guide.', schema: apiErrorResponseSchema },
      404: { description: 'No image with that id on that tour.', schema: apiErrorResponseSchema },
    },
  },
]
