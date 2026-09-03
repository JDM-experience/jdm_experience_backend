import { prisma } from '../config/prisma'
import { ApiError } from '../middleware/errorHandler'
import { isBookingAllowed } from '../lib/dateTime'
import { getBookingCutoffHour } from './settings.service'
import { recordAuditLog } from './auditLog.service'
import { sendBookingConfirmedEmail } from './email.service'
import { Prisma, type BookingStatus, type PaymentStatus, type Role } from '../generated/prisma/client'

type Actor = { userId: number; role: Role }

const BOOKING_INCLUDE = { paymentMethod: true } satisfies Prisma.BookingInclude
type BookingWithRelations = Prisma.BookingGetPayload<{ include: typeof BOOKING_INCLUDE }>

function toPublicBooking(b: BookingWithRelations) {
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
    customerName: b.customerName,
    customerEmail: b.customerEmail,
    customerPhone: b.customerPhone,
    paymentMethodId: b.paymentMethodId,
    paymentMethodName: b.paymentMethod?.name ?? null,
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
  input: {
    tourId: number
    bookingDate: string
    participants: number
    specialRequests?: string
    customerName?: string
    customerEmail?: string
    customerPhone?: string
    paymentMethodId?: number
  },
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

  if (input.paymentMethodId !== undefined) {
    const method = await prisma.paymentMethod.findUnique({ where: { id: input.paymentMethodId } })
    if (!method || !method.isActive) throw new ApiError(400, 'Invalid or inactive payment method.')
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
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      paymentMethodId: input.paymentMethodId,
    },
    include: BOOKING_INCLUDE,
  })

  return toPublicBooking(booking)
}

export async function getMyBookings(userId: number) {
  const rows = await prisma.booking.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, include: BOOKING_INCLUDE })
  return rows.map(toPublicBooking)
}

export async function getBooking(id: number) {
  const row = await prisma.booking.findUnique({ where: { id }, include: BOOKING_INCLUDE })
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
      include: BOOKING_INCLUDE,
    })
    return rows.map(toPublicBooking)
  }

  const rows = await prisma.booking.findMany({ orderBy: { createdAt: 'desc' }, include: BOOKING_INCLUDE })
  return rows.map(toPublicBooking)
}

/**
 * Status transitions reuse the existing BookingStatus/PaymentStatus enums rather than adding new
 * values (avoids a second, overlapping status concept): "payment submitted" is
 * paymentStatus=PENDING (set in payment.service.ts's addPaymentProof), "confirmed" is
 * status=CONFIRMED (this function, staff-only), "rejected" is status=CANCELLED +
 * paymentStatus=FAILED (also this function).
 *
 * Uploading payment proof never confirms a booking by itself -- only an explicit CONFIRMED
 * transition here does, and only after re-checking per-date exclusivity inside the transaction.
 * On a transition to CONFIRMED, sends the customer their confirmation email (with the tour's
 * customer-facing contact info) -- never before the update has actually committed.
 */
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
      include: BOOKING_INCLUDE,
    })
  })

  await recordAuditLog({
    userId: actor.userId,
    action: 'booking.status_update',
    entity: 'bookings',
    entityId: id,
    metadata: input,
  })

  if (input.status === 'CONFIRMED') {
    const [tour, customer] = await Promise.all([
      prisma.tour.findUnique({ where: { id: updated.tourId } }),
      prisma.user.findUnique({ where: { userId: updated.userId } }),
    ])
    const recipientEmail = updated.customerEmail ?? customer?.email
    if (recipientEmail) {
      await sendBookingConfirmedEmail({
        to: recipientEmail,
        customerName: updated.customerName ?? customer?.fullName ?? 'Customer',
        tourName: updated.tourNameSnapshot,
        bookingDate: updated.bookingDate.toISOString().slice(0, 10),
        bookingId: updated.id,
        paymentMethodName: updated.paymentMethod?.name ?? null,
        status: updated.status,
        contactName: tour?.contactName ?? null,
        contactEmail: tour?.contactEmail ?? null,
        contactPhone: tour?.contactPhone ?? null,
      })
    }
  }

  return toPublicBooking(updated)
}
