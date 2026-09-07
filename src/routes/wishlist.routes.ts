import { add, list, remove } from '../controllers/wishlist.controller'
import { requireAuth } from '../middleware/auth.middleware'
import { validateBody } from '../middleware/validate'
import { apiErrorResponseSchema } from '../validators/common.validator'
import {
  addToWishlistSchema,
  removeFromWishlistResponseSchema,
  wishlistItemResponseSchema,
  wishlistListResponseSchema,
} from '../validators/wishlist.validator'
import type { RouteDefinition } from './route-definition'

// A customer saving a tour for later -- entirely separate from Bookings (see the Wishlist model
// comment in schema.prisma). Every route requires auth; ownership is structural in the service
// (every query/mutation is scoped to req.user.userId), not a separate middleware, same pattern as
// GET /bookings/my-bookings.
export const wishlistRoutes: RouteDefinition[] = [
  {
    method: 'get',
    path: '/wishlist',
    handler: [requireAuth, list],
    summary: "List the calling user's own wishlist",
    description: 'Each item includes the full Tour. Tours that have been (soft-)deleted since being saved are excluded.',
    responses: {
      200: { description: "The caller's wishlist, newest first.", schema: wishlistListResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'post',
    path: '/wishlist',
    handler: [requireAuth, validateBody(addToWishlistSchema), add],
    summary: 'Add a tour to the wishlist',
    description: 'userId is always taken from the auth token, never the request body. 409 if the tour is already saved.',
    request: { body: addToWishlistSchema },
    responses: {
      201: { description: 'Added to wishlist.', schema: wishlistItemResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      404: { description: 'No tour with that id.', schema: apiErrorResponseSchema },
      409: { description: 'Already in this user\'s wishlist.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'delete',
    path: '/wishlist/:tourId',
    handler: [requireAuth, remove],
    summary: 'Remove a tour from the wishlist',
    description: 'Only removes the wishlist relationship -- never the Tour itself.',
    responses: {
      200: { description: 'Removed from wishlist.', schema: removeFromWishlistResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      404: { description: 'This tour is not in the caller\'s wishlist.', schema: apiErrorResponseSchema },
    },
  },
]
