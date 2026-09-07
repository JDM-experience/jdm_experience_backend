import { prisma } from '../config/prisma'
import { ApiError } from '../middleware/errorHandler'
import { isBookingAllowed } from '../lib/dateTime'
import { getBookingCutoffHour } from './settings.service'
import { recordAuditLog } from './auditLog.service'
import { sendBookingConfirmedEmail } from './email.service'
import { createNotification } from './notification.service'
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
 * `participants` never exceeds the tour's seat cap. A tour-date is exclusive to at most one active
 * (PENDING or CONFIRMED) booking at a time -- "one tour + one date = one active booking/hold" --
 * so this rejects a new request the moment *any* non-cancelled booking already exists for that
 * date, not just a CONFIRMED one.
 *
 * The customer must currently hold this exact date (see tourDateHold.service.ts's holdDate,
 * called from TourDetail the moment the date is picked) -- that hold's own database-level unique
 * constraint is what actually prevents two customers from racing into this function for the same
 * date at the same instant; this function just requires possession of it and consumes it as part
 * of the same transaction that creates the Booking, so there's never a window where the hold is
 * gone but no Booking exists yet, or vice versa.
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
  const alreadyActive = await prisma.booking.findFirst({
    where: { tourId: input.tourId, bookingDate, status: { in: ['PENDING', 'CONFIRMED'] } },
  })
  if (alreadyActive) {
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
    const hold = await tx.tourDateHold.findUnique({
      where: { tourId_bookingDate: { tourId: input.tourId, bookingDate } },
    })
    if (!hold || hold.userId !== actor.userId || hold.expiresAt < new Date()) {
      throw new ApiError(400, 'This date is no longer held for you — please reselect the date and try again.')
    }
    await tx.tourDateHold.delete({ where: { id: hold.id } })

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

  await recordAuditLog({
    userId: actor.userId,
    role: actor.role,
    action: 'booking.create',
    entity: 'bookings',
    entityId: booking.id,
    metadata: { tourId: booking.tourId, bookingDate: input.bookingDate },
  })

  return toPublicBooking(booking)
}

export interface BookingListFilter {
  search?: string
  status?: BookingStatus
  paymentStatus?: PaymentStatus
  tourId?: number
  dateFrom?: string
  dateTo?: string
  sortBy?: 'createdAt' | 'bookingDate' | 'customerName' | 'tourName' | 'status' | 'paymentStatus' | 'totalPrice'
  sortOrder?: 'asc' | 'desc'
}

// Whitelist mapping only -- never build `orderBy` from a raw client-supplied field name (see
// bookingSortByEnum in booking.validator.ts, which is what actually constrains req.query.sortBy
// before it ever reaches here). "tourName" maps onto the snapshot column since that's what's
// actually sortable/searchable here, not a join to the live (and possibly since-edited) Tour row.
const SORT_FIELD_MAP = {
  createdAt: 'createdAt',
  bookingDate: 'bookingDate',
  customerName: 'customerName',
  tourName: 'tourNameSnapshot',
  status: 'status',
  paymentStatus: 'paymentStatus',
  totalPrice: 'totalPrice',
} as const satisfies Record<string, keyof Prisma.BookingOrderByWithRelationInput>

/** Shared by listBookings (staff) and getMyBookings (customer) -- role/ownership scoping is
 *  applied by the caller on top of whatever `where` this returns, never overridable by filter. */
function buildBookingWhere(filter?: BookingListFilter): Prisma.BookingWhereInput {
  const where: Prisma.BookingWhereInput = {}
  if (filter?.status) where.status = filter.status
  if (filter?.paymentStatus) where.paymentStatus = filter.paymentStatus
  if (filter?.tourId) where.tourId = filter.tourId

  if (filter?.dateFrom || filter?.dateTo) {
    where.bookingDate = {
      ...(filter.dateFrom ? { gte: new Date(`${filter.dateFrom}T00:00:00.000Z`) } : {}),
      ...(filter.dateTo ? { lte: new Date(`${filter.dateTo}T23:59:59.999Z`) } : {}),
    }
  }

  if (filter?.search) {
    const search = filter.search.trim()
    // "JDM-19" or a bare "19" -- the reference format shown throughout the admin UI -- matches by
    // exact id instead of a text search across it.
    const idMatch = /^(?:jdm-)?(\d+)$/i.exec(search)
    if (idMatch) {
      where.id = Number(idMatch[1])
    } else {
      where.OR = [
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerEmail: { contains: search, mode: 'insensitive' } },
        { tourNameSnapshot: { contains: search, mode: 'insensitive' } },
        { paymentMethod: { name: { contains: search, mode: 'insensitive' } } },
      ]
    }
  }

  return where
}

function buildBookingOrderBy(filter?: BookingListFilter): Prisma.BookingOrderByWithRelationInput {
  if (!filter?.sortBy) return { createdAt: 'desc' }
  return { [SORT_FIELD_MAP[filter.sortBy]]: filter.sortOrder ?? 'asc' }
}

/** Always scoped to the caller's own bookings -- `filter` can never widen this to another user's
 *  data, regardless of what a customer sends in the query string. */
export async function getMyBookings(userId: number, filter?: BookingListFilter) {
  const rows = await prisma.booking.findMany({
    where: { ...buildBookingWhere(filter), userId },
    orderBy: buildBookingOrderBy(filter),
    include: BOOKING_INCLUDE,
  })
  return rows.map(toPublicBooking)
}

export async function getBooking(id: number) {
  const row = await prisma.booking.findUnique({ where: { id }, include: BOOKING_INCLUDE })
  if (!row) throw new ApiError(404, 'Booking not found.')
  return toPublicBooking(row)
}

/** SUPER_ADMIN/ADMIN see every booking; TOUR_GUIDE sees only bookings on their own tours. */
export async function listBookings(actor: Actor, filter?: BookingListFilter) {
  const where = buildBookingWhere(filter)
  const orderBy = buildBookingOrderBy(filter)

  if (actor.role === 'TOUR_GUIDE') {
    const guide = await prisma.tourGuide.findUnique({ where: { userId: actor.userId } })
    if (!guide) return []
    const rows = await prisma.booking.findMany({
      where: { ...where, tour: { guideId: guide.id } },
      orderBy,
      include: BOOKING_INCLUDE,
    })
    return rows.map(toPublicBooking)
  }

  const rows = await prisma.booking.findMany({ where, orderBy, include: BOOKING_INCLUDE })
  return rows.map(toPublicBooking)
}

/**
 * Customer self-service cancellation -- deliberately its own function/endpoint rather than
 * reusing the staff-only updateBookingStatus route, since the eligibility rule here is stricter
 * and different in kind: only the booking's own customer (never staff, who already have the
 * confirm/reject flow via PUT /bookings/:id), and only while it's still PENDING + UNPAID. Once
 * proof has been submitted (paymentStatus moves to PENDING) it's under staff review and the
 * customer can no longer unilaterally cancel it. Delegates the actual state change to
 * updateBookingStatus so cancellation always follows the exact same CANCELLED-transition rules
 * (paymentStatus -> FAILED, audit log) as the staff-initiated reject path.
 */
export async function cancelOwnBooking(actor: Actor, id: number) {
  const existing = await prisma.booking.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Booking not found.')

  if (existing.userId !== actor.userId) {
    throw new ApiError(403, 'You are not authorized to cancel this booking.')
  }
  if (existing.status !== 'PENDING' || existing.paymentStatus !== 'UNPAID') {
    throw new ApiError(400, 'Only pending, unpaid bookings can be cancelled.')
  }

  return updateBookingStatus(actor, id, { status: 'CANCELLED' })
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

      // Harmless second safety net -- createBooking's own PENDING/CONFIRMED exclusivity check
      // already prevents a second active booking for this date from ever being created, so this
      // should never actually find anything in normal operation. Kept as a guard against any
      // historical row that predates that check, inside the same transaction as the update below.
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

    // A tour can only be marked complete once it was actually confirmed (and therefore paid) --
    // never straight from PENDING/CANCELLED, which would leave a COMPLETED booking with no paid
    // reservation behind it.
    if (input.status === 'COMPLETED' && existing.status !== 'CONFIRMED') {
      throw new ApiError(400, 'Only a confirmed booking can be marked completed.')
    }

    return tx.booking.update({
      where: { id },
      data: { status: input.status, paymentStatus },
      include: BOOKING_INCLUDE,
    })
  })

  await recordAuditLog({
    userId: actor.userId,
    role: actor.role,
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

    void createNotification({
      userId: updated.userId,
      type: 'BOOKING_CONFIRMED',
      title: 'Booking confirmed',
      message: `Your booking JDM-${updated.id} for ${updated.tourNameSnapshot} has been confirmed.`,
      relatedEntityType: 'booking',
      relatedEntityId: updated.id,
    }).catch((error) => console.error('[booking.service] Failed to create notification:', error))
  }

  // Distinguishes the staff "reject payment" path (PUT /bookings/:id with an explicit
  // paymentStatus: 'FAILED') from a customer's own self-cancel (cancelOwnBooking never sends
  // paymentStatus explicitly, even though it lands on the same FAILED value above) -- only the
  // staff-initiated rejection is something the customer needs to be notified about.
  if (input.status === 'CANCELLED' && input.paymentStatus === 'FAILED') {
    void createNotification({
      userId: updated.userId,
      type: 'PAYMENT_REJECTED',
      title: 'Payment rejected',
      message: `Your payment for booking JDM-${updated.id} was rejected. Please review and resubmit.`,
      relatedEntityType: 'booking',
      relatedEntityId: updated.id,
    }).catch((error) => console.error('[booking.service] Failed to create notification:', error))
  }

  return toPublicBooking(updated)
}
