import { prisma } from '../config/prisma'
import { ApiError } from '../middleware/errorHandler'
import { isBookingAllowed } from '../lib/dateTime'
import { getBookingCutoffHour } from './settings.service'
import { Prisma, type Role } from '../generated/prisma/client'

type Actor = { userId: number; role: Role }

/** How long a hold reserves a date before it's treated as abandoned. Generous enough to cover
 *  filling in contact info and uploading payment proof; short enough that an abandoned selection
 *  doesn't lock a date out for long. Refreshed (not just re-checked) each time the same customer
 *  re-holds the same date -- see holdDate below and ReservationCheckout's on-mount refresh. */
const HOLD_TTL_MINUTES = 15

function toDateOnly(bookingDate: string): Date {
  return new Date(`${bookingDate}T00:00:00.000Z`)
}

/**
 * Reserves a tour+date for the calling customer, atomically. The `@@unique([tourId, bookingDate])`
 * constraint on TourDateHold is what actually makes this safe under a real race between two
 * customers selecting the same date at the same instant -- Postgres lets only one insert succeed;
 * the loser is caught here (P2002) and turned into the same 409 a pre-existing conflict would
 * produce, so both paths end at the same customer-facing message.
 */
export async function holdDate(actor: Actor, tourId: number, bookingDate: string) {
  const cutoffHour = await getBookingCutoffHour()
  if (!isBookingAllowed(bookingDate, cutoffHour)) {
    throw new ApiError(
      400,
      `Booking for today has closed — same-day bookings close after ${cutoffHour}:00 Japan Standard Time. Please choose another date.`,
    )
  }

  const tour = await prisma.tour.findUnique({ where: { id: tourId } })
  if (!tour || tour.isDeleted || tour.status !== 'AVAILABLE') {
    throw new ApiError(404, 'This tour is not available for booking.')
  }

  const date = toDateOnly(bookingDate)
  const expiresAt = new Date(Date.now() + HOLD_TTL_MINUTES * 60 * 1000)

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Lazy cleanup: an expired hold for this exact date never permanently blocks it -- the next
      // hold attempt (from anyone) clears it out before checking/inserting.
      await tx.tourDateHold.deleteMany({ where: { tourId, bookingDate: date, expiresAt: { lt: new Date() } } })

      const conflictingBooking = await tx.booking.findFirst({
        where: { tourId, bookingDate: date, status: { in: ['PENDING', 'CONFIRMED'] } },
      })
      if (conflictingBooking) {
        throw new ApiError(409, 'This date is currently unavailable.')
      }

      const existingHold = await tx.tourDateHold.findUnique({ where: { tourId_bookingDate: { tourId, bookingDate: date } } })
      if (existingHold && existingHold.userId !== actor.userId) {
        throw new ApiError(409, 'This date is currently unavailable.')
      }

      if (existingHold) {
        return tx.tourDateHold.update({ where: { id: existingHold.id }, data: { expiresAt } })
      }
      return tx.tourDateHold.create({ data: { tourId, bookingDate: date, userId: actor.userId, expiresAt } })
    })

    return { tourId, bookingDate, expiresAt: result.expiresAt }
  } catch (error) {
    // Race: two concurrent holdDate calls both pass the findUnique check above before either
    // commits -- the loser's insert violates the unique constraint here instead.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ApiError(409, 'This date is currently unavailable.')
    }
    throw error
  }
}

/** Best-effort release -- called when a customer picks a different date or navigates away without
 *  completing checkout, so the slot frees up sooner than the full TTL. Idempotent: a no-op if the
 *  caller doesn't currently hold this date (already expired, already consumed by createBooking,
 *  or never held). */
export async function releaseDate(actor: Actor, tourId: number, bookingDate: string): Promise<void> {
  await prisma.tourDateHold.deleteMany({ where: { tourId, bookingDate: toDateOnly(bookingDate), userId: actor.userId } })
}
