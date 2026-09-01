import {
  addImage,
  create,
  createAvailability,
  getOne,
  list,
  listAvailability,
  listGuides,
  myTours,
  remove,
  removeAvailability,
  removeImage,
  update,
  updateAvailability,
} from '../controllers/tour.controller'
import { requireAuth } from '../middleware/auth.middleware'
import { requireRole, verifyTourAssignment } from '../middleware/rbac'
import { validateBody, validateQuery } from '../middleware/validate'
import { apiErrorResponseSchema } from '../validators/common.validator'
import {
  addTourImageSchema,
  createAvailabilitySchema,
  createTourSchema,
  deleteTourAvailabilityResponseSchema,
  deleteTourImageResponseSchema,
  deleteTourResponseSchema,
  tourAvailabilityListResponseSchema,
  tourAvailabilityResponseSchema,
  tourGuidesListResponseSchema,
  tourImageResponseSchema,
  tourListQuerySchema,
  tourResponseSchema,
  toursListResponseSchema,
  updateAvailabilitySchema,
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
    request: { query: tourListQuerySchema },
    responses: { 200: { description: 'Tours, optionally filtered by status.', schema: toursListResponseSchema } },
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
    path: '/tours/:tourId/availability',
    handler: listAvailability,
    summary: "List a tour's availability slots",
    responses: {
      200: { description: 'Availability slots, soonest first.', schema: tourAvailabilityListResponseSchema },
      400: { description: 'tourId was not a positive integer.', schema: apiErrorResponseSchema },
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
  // Delete/archive: Super Admin (any tour), or a Tour Guide archiving their own tour. Admin may
  // never archive a tour. requireRole runs first, so Admin is rejected before verifyTourAssignment
  // (which would otherwise also bypass Admin) ever executes.
  {
    method: 'delete',
    path: '/tours/:id',
    handler: [requireAuth, requireRole('SUPER_ADMIN', 'TOUR_GUIDE'), verifyTourAssignment, remove],
    summary: 'Archive a tour (soft delete)',
    responses: {
      200: { description: 'Tour archived.', schema: deleteTourResponseSchema },
      400: { description: 'id was not a positive integer.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN, or not the assigned guide.', schema: apiErrorResponseSchema },
      404: { description: 'No tour with that id.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'put',
    path: '/tours/:id',
    handler: [...staffOrOwnGuide, validateBody(updateTourSchema), update],
    summary: 'Update a tour',
    request: { body: updateTourSchema },
    responses: {
      200: { description: 'Tour updated.', schema: tourResponseSchema },
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
  {
    method: 'post',
    path: '/tours/:tourId/availability',
    handler: [...staffOrOwnGuide, validateBody(createAvailabilitySchema), createAvailability],
    summary: 'Add an availability slot to a tour',
    request: { body: createAvailabilitySchema },
    responses: {
      201: { description: 'Availability slot created.', schema: tourAvailabilityResponseSchema },
      400: { description: 'tourId was not a positive integer.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not staff or the assigned guide.', schema: apiErrorResponseSchema },
      404: { description: 'No tour with that id.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'put',
    path: '/tours/:tourId/availability/:availabilityId',
    handler: [...staffOrOwnGuide, validateBody(updateAvailabilitySchema), updateAvailability],
    summary: 'Update an availability slot',
    request: { body: updateAvailabilitySchema },
    responses: {
      200: { description: 'Availability slot updated.', schema: tourAvailabilityResponseSchema },
      400: { description: 'tourId/availabilityId was not a positive integer.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not staff or the assigned guide.', schema: apiErrorResponseSchema },
      404: { description: 'No availability slot with that id on that tour.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'delete',
    path: '/tours/:tourId/availability/:availabilityId',
    handler: [...staffOrOwnGuide, removeAvailability],
    summary: 'Remove an availability slot',
    responses: {
      200: { description: 'Availability slot removed.', schema: deleteTourAvailabilityResponseSchema },
      400: { description: 'tourId/availabilityId was not a positive integer.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not staff or the assigned guide.', schema: apiErrorResponseSchema },
      404: { description: 'No availability slot with that id on that tour.', schema: apiErrorResponseSchema },
    },
  },
]
