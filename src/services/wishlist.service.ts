import { prisma } from '../config/prisma'
import { ApiError } from '../middleware/errorHandler'
import { TOUR_INCLUDE, toPublicTour } from './tour.service'

const WISHLIST_INCLUDE = { tour: { include: TOUR_INCLUDE } } as const

/**
 * Saved tours are separate from Bookings entirely -- booking/paying/confirming a tour never adds
 * or removes a wishlist entry (see the model comment in schema.prisma). Tours are soft-deleted,
 * never actually removed (see deleteTour in tour.service.ts), so a wishlist row's FK never
 * breaks -- deleted tours are filtered out here at read time instead.
 */
export async function listMyWishlist(userId: number) {
  const rows = await prisma.wishlist.findMany({
    where: { userId, tour: { isDeleted: false } },
    include: WISHLIST_INCLUDE,
    orderBy: { createdAt: 'desc' },
  })
  return rows.map((row) => ({
    id: row.id,
    tourId: row.tourId,
    createdAt: row.createdAt,
    tour: toPublicTour(row.tour),
  }))
}

/** Never trusts the client for identity (userId always comes from the authenticated actor). */
export async function addToWishlist(userId: number, tourId: number) {
  const tour = await prisma.tour.findUnique({ where: { id: tourId } })
  if (!tour || tour.isDeleted) throw new ApiError(404, 'Tour not found.')

  const existing = await prisma.wishlist.findUnique({ where: { userId_tourId: { userId, tourId } } })
  if (existing) throw new ApiError(409, 'This tour is already in your wishlist.')

  const row = await prisma.wishlist.create({
    data: { userId, tourId },
    include: WISHLIST_INCLUDE,
  })
  return { id: row.id, tourId: row.tourId, createdAt: row.createdAt, tour: toPublicTour(row.tour) }
}

/** Ownership is structural: the lookup/delete always keys on the caller's own userId, so there is
 *  no way to target another customer's entry -- only removes the wishlist relationship, never the
 *  Tour itself. */
export async function removeFromWishlist(userId: number, tourId: number): Promise<void> {
  const existing = await prisma.wishlist.findUnique({ where: { userId_tourId: { userId, tourId } } })
  if (!existing) throw new ApiError(404, 'This tour is not in your wishlist.')

  await prisma.wishlist.delete({ where: { id: existing.id } })
}
