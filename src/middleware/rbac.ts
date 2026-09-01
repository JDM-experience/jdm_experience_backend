import type { RequestHandler } from 'express'
import { prisma } from '../config/prisma'
import { ApiError } from './errorHandler'
import type { Role } from '../generated/prisma/client'

const STAFF_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN']

/** 403 unless `req.user.role` is one of `roles`. Must run after `requireAuth`. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      next(new ApiError(401, 'Not authenticated.'))
      return
    }
    if (!roles.includes(req.user.role)) {
      next(new ApiError(403, 'You are not authorized to perform this action.'))
      return
    }
    next()
  }
}

/**
 * For TOUR_GUIDE-accessible tour routes: 403 unless this tour is assigned to the calling guide.
 * SUPER_ADMIN/ADMIN bypass ownership entirely. Reads the tour id from `:tourId` or `:id`.
 */
export const verifyTourAssignment: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new ApiError(401, 'Not authenticated.')
    if (STAFF_ROLES.includes(req.user.role)) {
      next()
      return
    }
    if (req.user.role !== 'TOUR_GUIDE') {
      throw new ApiError(403, 'You are not authorized to manage this tour.')
    }

    const tourId = Number(req.params.tourId ?? req.params.id)
    const tour = await prisma.tour.findUnique({ where: { id: tourId }, include: { guide: true } })
    if (!tour) throw new ApiError(404, 'Tour not found.')

    if (tour.guide?.userId !== req.user.userId) {
      throw new ApiError(403, 'You are not authorized to manage this tour.')
    }
    next()
  } catch (error) {
    next(error)
  }
}

/**
 * For customer booking routes: 403 unless the booking belongs to the current user (CUSTOMER),
 * or the booking's tour is assigned to the current user (TOUR_GUIDE). SUPER_ADMIN/ADMIN bypass.
 * Reads the booking id from `:id`.
 */
export const verifyBookingOwnership: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new ApiError(401, 'Not authenticated.')
    if (STAFF_ROLES.includes(req.user.role)) {
      next()
      return
    }

    const bookingId = Number(req.params.id)
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } })
    if (!booking) throw new ApiError(404, 'Booking not found.')

    if (req.user.role === 'TOUR_GUIDE') {
      const tour = await prisma.tour.findUnique({
        where: { id: booking.tourId },
        include: { guide: true },
      })
      if (tour?.guide?.userId === req.user.userId) {
        next()
        return
      }
      throw new ApiError(403, 'You are not authorized to view this booking.')
    }

    if (booking.userId !== req.user.userId) {
      throw new ApiError(403, 'You are not authorized to view this booking.')
    }
    next()
  } catch (error) {
    next(error)
  }
}
