import { prisma } from '../config/prisma'
import { ApiError } from '../middleware/errorHandler'
import { isBookingAllowed } from '../lib/dateTime'
import { getBookingCutoffHour } from './settings.service'
import { recordAuditLog } from './auditLog.service'
import type { Booking, BookingStatus, PaymentStatus, Role } from '../generated/prisma/client'

type Actor = { userId: number; role: Role }

function toPublicBooking(b: Booking) {
  return {
    id: b.id,
    userId: b.userId,
    tourId: b.tourId,
    availabilityId: b.availabilityId,
    bookingDate: b.bookingDate,
    participants: b.participants,
    status: b.status,
    totalPrice: Number(b.totalPrice),
    depositPaid: b.depositPaid !== null ? Number(b.depositPaid) : null,
    paymentStatus: b.paymentStatus,
    tourNameSnapshot: b.tourNameSnapshot,
    unitPriceSnapshot: Number(b.unitPriceSnapshot),
    currency: b.currency,
    specialRequests: b.specialRequests,
    createdAt: b.createdAt,
  }
}

/**
 * The one rule everything else re-validates against: no new booking after the JST cutoff, and
 * never more participants than a date actually has room for. Runs inside a transaction so a
 * concurrent booking on the same date can't both succeed and overbook the slot.
 */
export async function createBooking(
  actor: Actor,
  input: { tourId: number; bookingDate: string; participants: number; specialRequests?: string },
) {
  const cutoffHour = await getBookingCutoffHour()
  if (!isBookingAllowed(input.bookingDate, cutoffHour)) {
    throw new ApiError(
      400,
      `Booking for today has closed — same-day bookings close after ${cutoffHour}:00 Japan Standard Time. Please choose another date.`,
    )
  }

  const booking = await prisma.$transaction(async (tx) => {
    const tour = await tx.tour.findUnique({ where: { id: input.tourId } })
    if (!tour || tour.isDeleted || tour.status !== 'AVAILABLE') {
      throw new ApiError(404, 'This tour is not available for booking.')
    }

    // `TourAvailability.startDatetime` is an absolute instant (stored as UTC); the customer's
    // `bookingDate` is a JST calendar date. Matching them means bounding by the JST day's start
    // and the next JST day's start, expressed as UTC instants — not naive UTC-day boundaries,
    // which would be off by up to 9 hours near midnight.
    const jstDayStart = new Date(`${input.bookingDate}T00:00:00+09:00`)
    const nextJstDayStart = new Date(jstDayStart.getTime() + 24 * 60 * 60 * 1000)
    const availability = await tx.tourAvailability.findFirst({
      where: { tourId: input.tourId, startDatetime: { gte: jstDayStart, lt: nextJstDayStart } },
    })

    if (!availability) {
      throw new ApiError(400, 'No availability is configured for this tour on the selected date.')
    }
    if (availability.spotsRemaining < input.participants) {
      throw new ApiError(409, 'Not enough spots remaining for this date.')
    }

    // Guarded by the transaction: a concurrent booking against the same slot can't both pass
    // the check above and both decrement past zero.
    await tx.tourAvailability.update({
      where: { id: availability.id },
      data: { spotsRemaining: { decrement: input.participants } },
    })

    return tx.booking.create({
      data: {
        userId: actor.userId,
        tourId: tour.id,
        availabilityId: availability.id,
        // bookingDate is a bare DATE column — store the calendar date the customer picked
        // literally, not derived from the JST-offset instant above (which can shift the UTC
        // calendar date near midnight).
        bookingDate: new Date(`${input.bookingDate}T00:00:00.000Z`),
        participants: input.participants,
        status: 'PENDING',
        totalPrice: Number(tour.price) * input.participants,
        paymentStatus: 'UNPAID',
        tourNameSnapshot: tour.name,
        unitPriceSnapshot: tour.price,
        currency: tour.currency ?? 'JPY',
        specialRequests: input.specialRequests,
      },
    })
  })

  return toPublicBooking(booking)
}

export async function getMyBookings(userId: number) {
  const rows = await prisma.booking.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
  return rows.map(toPublicBooking)
}

export async function getBooking(id: number) {
  const row = await prisma.booking.findUnique({ where: { id } })
  if (!row) throw new ApiError(404, 'Booking not found.')
  return toPublicBooking(row)
}

/** SUPER_ADMIN/ADMIN see every booking; TOUR_GUIDE sees only bookings on their own tours. */
export async function listBookings(actor: Actor) {
  if (actor.role === 'TOUR_GUIDE') {
    const guide = await prisma.tourGuide.findUnique({ where: { userId: actor.userId } })
    if (!guide) return []
    const rows = await prisma.booking.findMany({
      where: { tour: { guideId: guide.id } },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map(toPublicBooking)
  }

  const rows = await prisma.booking.findMany({ orderBy: { createdAt: 'desc' } })
  return rows.map(toPublicBooking)
}

export async function updateBookingStatus(
  actor: Actor,
  id: number,
  input: { status?: BookingStatus; paymentStatus?: PaymentStatus },
) {
  const existing = await prisma.booking.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Booking not found.')

  const updated = await prisma.booking.update({
    where: { id },
    data: { status: input.status, paymentStatus: input.paymentStatus },
  })

  await recordAuditLog({
    userId: actor.userId,
    action: 'booking.status_update',
    entity: 'bookings',
    entityId: id,
    metadata: input,
  })

  return toPublicBooking(updated)
}
