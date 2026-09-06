import { prisma } from '../config/prisma'
import { ApiError } from '../middleware/errorHandler'
import { recordAuditLog } from './auditLog.service'
import type { Role } from '../generated/prisma/client'

type Actor = { userId: number; role: Role }

const STAFF_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN']

function toPublicReview(row: {
  id: number
  userId: number
  tourId: number
  rating: number
  comment: string
  createdAt: Date
  updatedAt: Date
  user: { fullName: string | null }
}) {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.user.fullName,
    tourId: row.tourId,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

const REVIEW_INCLUDE = { user: { select: { fullName: true } } } as const

/**
 * "Availed the tour" is deliberately mapped to a COMPLETED booking, not CONFIRMED -- CONFIRMED
 * only means the reservation is locked in and paid, not that the tour has actually happened yet.
 * A review is a statement about an experience that occurred, so it requires the booking to have
 * been marked COMPLETED (see updateBookingStatus in booking.service.ts).
 */
async function hasAvailedTour(userId: number, tourId: number): Promise<boolean> {
  const completedBooking = await prisma.booking.findFirst({
    where: { userId, tourId, status: 'COMPLETED' },
    select: { id: true },
  })
  return completedBooking !== null
}

/** Public -- anyone can read a tour's reviews, no auth required. */
export async function listReviewsForTour(tourId: number) {
  const rows = await prisma.review.findMany({
    where: { tourId },
    include: REVIEW_INCLUDE,
    orderBy: { createdAt: 'desc' },
  })
  const totalCount = rows.length
  const averageRating = totalCount === 0 ? null : Math.round((rows.reduce((sum, r) => sum + r.rating, 0) / totalCount) * 10) / 10
  return { reviews: rows.map(toPublicReview), averageRating, totalCount }
}

export async function getReview(id: number) {
  const row = await prisma.review.findUnique({ where: { id }, include: REVIEW_INCLUDE })
  if (!row) throw new ApiError(404, 'Review not found.')
  return toPublicReview(row)
}

/**
 * Never trusts the client for identity (userId always comes from the authenticated actor) or for
 * eligibility (re-verified here against the booking table regardless of what the UI showed).
 */
export async function createReview(actor: Actor, tourId: number, input: { rating: number; comment: string }) {
  const tour = await prisma.tour.findUnique({ where: { id: tourId } })
  if (!tour || tour.isDeleted) throw new ApiError(404, 'Tour not found.')

  const eligible = await hasAvailedTour(actor.userId, tourId)
  if (!eligible) {
    throw new ApiError(403, 'You can review this tour after completing a booking for it.')
  }

  const existing = await prisma.review.findUnique({ where: { userId_tourId: { userId: actor.userId, tourId } } })
  if (existing) {
    throw new ApiError(409, 'You have already reviewed this tour. Edit your existing review instead.')
  }

  const row = await prisma.review.create({
    data: { userId: actor.userId, tourId, rating: input.rating, comment: input.comment },
    include: REVIEW_INCLUDE,
  })

  await recordAuditLog({ userId: actor.userId, action: 'review.create', entity: 'reviews', entityId: row.id })
  return toPublicReview(row)
}

/** Owner or staff (SUPER_ADMIN/ADMIN) only -- userId/tourId are never editable, only rating/comment. */
export async function updateReview(actor: Actor, id: number, input: { rating?: number; comment?: string }) {
  const existing = await prisma.review.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Review not found.')

  const isOwner = existing.userId === actor.userId
  const isStaff = STAFF_ROLES.includes(actor.role)
  if (!isOwner && !isStaff) {
    throw new ApiError(403, 'You can only edit your own review.')
  }

  const row = await prisma.review.update({
    where: { id },
    data: { rating: input.rating, comment: input.comment },
    include: REVIEW_INCLUDE,
  })

  await recordAuditLog({ userId: actor.userId, action: 'review.update', entity: 'reviews', entityId: id })
  return toPublicReview(row)
}

export async function deleteReview(actor: Actor, id: number): Promise<void> {
  const existing = await prisma.review.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Review not found.')

  const isOwner = existing.userId === actor.userId
  const isStaff = STAFF_ROLES.includes(actor.role)
  if (!isOwner && !isStaff) {
    throw new ApiError(403, 'You can only delete your own review.')
  }

  await prisma.review.delete({ where: { id } })
  await recordAuditLog({ userId: actor.userId, action: 'review.delete', entity: 'reviews', entityId: id })
}
