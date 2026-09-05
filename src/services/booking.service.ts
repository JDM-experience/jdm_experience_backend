import { prisma } from '../config/prisma'
import { ApiError } from '../middleware/errorHandler'
import { isBookingAllowed } from '../lib/dateTime'
import { getBookingCutoffHour } from './settings.service'
import { recordAuditLog } from './auditLog.service'
import { sendBookingConfirmedEmail } from './email.service'
import { notifyPaymentProofSubmitted } from './payment.service'
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
 *
 * The checkout page is the only place a reservation is created, and it always has contact info,
 * a payment method, and payment proof by the time the customer confirms — so all three are
 * required here and created in the same transaction as the Booking itself, rather than as a
 * separate follow-up call. None of it is trusted from the frontend at face value: the payment
 * method is re-checked for existence/active status server-side regardless of what the client
 * already showed the customer (it may have changed since the checkout page loaded).
 */
export async function createBooking(
  actor: Actor,
  input: {
    tourId: number
    bookingDate: string
    participants: number
    specialRequests?: string
    customerName: string
    customerEmail: string
    customerPhone: string
    paymentMethodId: number
    paymentProof: { fileUrl: string; fileName: string; fileType: string }
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

  // Re-checked here regardless of what the checkout page already showed the customer -- an Admin
  // may have disabled/deleted the method in the meantime.
  const method = await prisma.paymentMethod.findUnique({ where: { id: input.paymentMethodId } })
  if (!method || !method.isActive) {
    throw new ApiError(400, 'This payment method is no longer available. Please select another payment method.')
  }

  // Interactive transaction (not the array form) -- the proof's bookingId depends on the id the
  // booking create just generated, which the array form of $transaction can't reference.
  const [booking, proof] = await prisma.$transaction(async (tx) => {
    const createdBooking = await tx.booking.create({
      data: {
        userId: actor.userId,
        tourId: tour.id,
        // bookingDate is a bare DATE column — store the calendar date the customer picked
        // literally, no timezone offset math needed since it's not compared against an instant.
        bookingDate,
        participants: input.participants,
        status: 'PENDING',
        totalPrice: Number(tour.price) * input.participants,
        // Proof arrives in the same request that creates the booking, so it's already
        // "submitted, awaiting review" from the very first moment it exists -- never a
        // momentarily-UNPAID row with no proof attached.
        paymentStatus: 'PENDING',
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
    const createdProof = await tx.paymentProof.create({
      data: {
        bookingId: createdBooking.id,
        uploadedBy: actor.userId,
        fileUrl: input.paymentProof.fileUrl,
        fileName: input.paymentProof.fileName,
        fileType: input.paymentProof.fileType,
      },
    })
    return [createdBooking, createdProof] as const
  })

  void notifyPaymentProofSubmitted(booking, proof).catch((error) => {
    console.error('[booking.service] Failed to send payment-proof notification emails:', error)
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
 * status=CONFIRMED + paymentStatus=PAID together (this function, staff-only, enforced below --
 * confirming a booking *is* the payment verification, the two can never move independently), and
 * "rejected" is status=CANCELLED + paymentStatus=FAILED (also enforced below, not left to the
 * caller to remember to send both).
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
    const existing = await tx.booking.findUnique({ where: { id }, include: { paymentProofs: true } })
    if (!existing) throw new ApiError(404, 'Booking not found.')

    let paymentStatus = input.paymentStatus

    if (input.status === 'CONFIRMED') {
      // Prevents a duplicate confirm action from re-running this whole block (and re-sending the
      // confirmation email) against a booking that's already confirmed.
      if (existing.status === 'CONFIRMED') {
        throw new ApiError(400, 'This booking is already confirmed.')
      }
      // Confirming without proof would mean marking a payment "verified" that staff never
      // actually saw -- createBooking always attaches one up front, but this guards any
      // booking (including ones that pre-date that requirement) regardless.
      if (existing.paymentProofs.length === 0) {
        throw new ApiError(400, 'This booking has no payment proof and cannot be confirmed.')
      }

      // This is where per-date exclusivity is actually enforced (createBooking only rejects a
      // *new* request against an already-CONFIRMED date; two PENDING requests for the same date
      // are allowed to coexist until one is confirmed). Guarded by the transaction so confirming
      // two competing PENDING bookings for the same date concurrently can't both succeed.
      const conflicting = await tx.booking.findFirst({
        where: { tourId: existing.tourId, bookingDate: existing.bookingDate, status: 'CONFIRMED', id: { not: id } },
      })
      if (conflicting) {
        throw new ApiError(409, 'Another booking for this tour and date is already confirmed.')
      }

      // The invariant this whole fix exists for: a CONFIRMED booking can never be left showing
      // paymentStatus=PENDING (or anything else the caller might have sent/forgotten to send).
      paymentStatus = 'PAID'
    }

    if (input.status === 'CANCELLED') {
      if (existing.status === 'CANCELLED') {
        throw new ApiError(400, 'This booking is already cancelled.')
      }
      // Rejecting a submitted payment: mark it FAILED unless the caller explicitly asked for a
      // different terminal value (e.g. REFUNDED for cancelling an already-paid booking) or it's
      // already sitting at one.
      if (paymentStatus === undefined && existing.paymentStatus !== 'PAID' && existing.paymentStatus !== 'REFUNDED') {
        paymentStatus = 'FAILED'
      }
    }

    return tx.booking.update({
      where: { id },
      data: { status: input.status, paymentStatus },
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
