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
 * `participants` never exceeds the tour's seat cap. A tour-date itself is exclusive to at most
 * one CONFIRMED booking — like reserving the whole vehicle for that day, not a seat within it —
 * but that exclusivity is enforced at *confirmation* time (see updateBookingStatus), not here: a
 * PENDING request doesn't block another customer from also requesting the same date, so two
 * PENDING requests for one date can coexist until staff confirms one of them.
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

  const tour = await prisma.tour.findUnique({ where: { id: input.tourId } })
  if (!tour || tour.isDeleted || tour.status !== 'AVAILABLE') {
    throw new ApiError(404, 'This tour is not available for booking.')
  }
  if (input.participants > tour.seats) {
    throw new ApiError(400, `This tour seats up to ${tour.seats}.`)
  }

  const bookingDate = new Date(`${input.bookingDate}T00:00:00.000Z`)
  const alreadyConfirmed = await prisma.booking.findFirst({
    where: { tourId: input.tourId, bookingDate, status: 'CONFIRMED' },
  })
  if (alreadyConfirmed) {
    throw new ApiError(409, 'This date is already booked for this tour. Please choose another date.')
  }

  const booking = await prisma.booking.create({
    data: {
      userId: actor.userId,
      tourId: tour.id,
      // bookingDate is a bare DATE column — store the calendar date the customer picked
      // literally, no timezone offset math needed since it's not compared against an instant.
      bookingDate,
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
  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.booking.findUnique({ where: { id } })
    if (!existing) throw new ApiError(404, 'Booking not found.')

    // This is where per-date exclusivity is actually enforced (createBooking only rejects a
    // *new* request against an already-CONFIRMED date; two PENDING requests for the same date
    // are allowed to coexist until one is confirmed). Guarded by the transaction so confirming
    // two competing PENDING bookings for the same date concurrently can't both succeed.
    if (input.status === 'CONFIRMED' && existing.status !== 'CONFIRMED') {
      const conflicting = await tx.booking.findFirst({
        where: { tourId: existing.tourId, bookingDate: existing.bookingDate, status: 'CONFIRMED', id: { not: id } },
      })
      if (conflicting) {
        throw new ApiError(409, 'Another booking for this tour and date is already confirmed.')
      }
    }

    return tx.booking.update({
      where: { id },
      data: { status: input.status, paymentStatus: input.paymentStatus },
    })
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
