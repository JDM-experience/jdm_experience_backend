import { prisma } from '../config/prisma'
import { ApiError } from '../middleware/errorHandler'
import { isMoreThan24HoursBeforeBooking } from '../lib/dateTime'
import { recordAuditLog } from './auditLog.service'
import { updateBookingStatus } from './booking.service'
import { createNotification } from './notification.service'
import {
  sendCancellationRefundCompletedEmail,
  sendCancellationRequestRejectedEmail,
  sendCancellationRequestStaffNotification,
  sendCancellationRequestSubmittedEmail,
} from './email.service'
import { Prisma, type CancellationRequestStatus, type Role } from '../generated/prisma/client'

type Actor = { userId: number; role: Role }

const CANCELLATION_REQUEST_INCLUDE = { refundMethod: true } satisfies Prisma.CancellationRequestInclude
type CancellationRequestWithRelations = Prisma.CancellationRequestGetPayload<{ include: typeof CANCELLATION_REQUEST_INCLUDE }>

function toPublicCancellationRequest(r: CancellationRequestWithRelations) {
  return {
    id: r.id,
    bookingId: r.bookingId,
    customerId: r.customerId,
    reason: r.reason,
    refundMethodId: r.refundMethodId,
    refundMethodName: r.refundMethodNameSnapshot,
    refundDestination: r.refundDestination,
    refundAmount: Number(r.refundAmount),
    status: r.status,
    rejectionReason: r.rejectionReason,
    refundProofUrl: r.refundProofUrl,
    refundProofFileName: r.refundProofFileName,
    refundProofFileType: r.refundProofFileType,
    approvedAt: r.approvedAt,
    rejectedAt: r.rejectedAt,
    refundedAt: r.refundedAt,
    createdAt: r.createdAt,
  }
}

/**
 * Customer self-service: requests cancellation + refund of an already-paid, confirmed booking.
 * Deliberately its own model/flow, not a variant of cancelOwnBooking (which only ever applies to
 * still-PENDING+UNPAID bookings and cancels immediately, no review step). Never mutates the
 * Booking itself -- it stays CONFIRMED/PAID until staff actually completes the refund (see
 * completeRefund below), so it's never mistaken for an already-cancelled/refunded reservation
 * while under review (see the reservation-status rules this whole feature was designed against).
 */
export async function requestCancellation(
  actor: Actor,
  bookingId: number,
  input: { reason: string; refundMethodId: number; refundDestination: string },
) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } })
  if (!booking) throw new ApiError(404, 'Booking not found.')
  if (booking.userId !== actor.userId) {
    throw new ApiError(403, 'You are not authorized to request cancellation of this booking.')
  }
  if (booking.status === 'CANCELLED') throw new ApiError(400, 'This booking is already cancelled.')
  if (booking.status === 'COMPLETED') throw new ApiError(400, 'This tour has already been completed and cannot be cancelled.')
  if (booking.paymentStatus !== 'PAID') {
    throw new ApiError(400, 'Only paid bookings can request cancellation through this flow.')
  }

  const existing = await prisma.cancellationRequest.findUnique({ where: { bookingId } })
  if (existing) throw new ApiError(409, 'A cancellation request already exists for this booking.')

  // Strict backend enforcement -- never trust an equivalent check the frontend may have already
  // run. Exactly 24 hours before the booking is treated as NOT eligible.
  if (!isMoreThan24HoursBeforeBooking(booking.bookingDate)) {
    throw new ApiError(400, 'Cancellation requests must be submitted more than 24 hours before the scheduled booking date.')
  }

  // Re-checked here regardless of what the customer's form already showed -- it may have been
  // deactivated since the form loaded (same discipline as createBooking's paymentMethodId check).
  const method = await prisma.paymentMethod.findUnique({ where: { id: input.refundMethodId } })
  if (!method || !method.isActive) {
    throw new ApiError(400, 'This refund method is no longer available. Please select another refund method.')
  }

  let created: CancellationRequestWithRelations
  try {
    created = await prisma.cancellationRequest.create({
      data: {
        bookingId,
        customerId: actor.userId,
        reason: input.reason,
        refundMethodId: method.id,
        refundMethodNameSnapshot: method.name,
        refundDestination: input.refundDestination,
        refundAmount: booking.totalPrice,
      },
      include: CANCELLATION_REQUEST_INCLUDE,
    })
  } catch (error) {
    // Race: two concurrent submissions for the same booking both pass the findUnique check above.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ApiError(409, 'A cancellation request already exists for this booking.')
    }
    throw error
  }

  await recordAuditLog({
    userId: actor.userId,
    role: actor.role,
    action: 'cancellationRequest.create',
    entity: 'cancellation_requests',
    entityId: created.id,
    metadata: { bookingId },
  })

  void notifyCancellationRequestSubmitted(created, booking).catch((error) => {
    console.error('[cancellationRequest.service] Failed to send cancellation-request notification emails:', error)
  })

  return toPublicCancellationRequest(created)
}

async function notifyCancellationRequestSubmitted(
  request: CancellationRequestWithRelations,
  booking: { id: number; tourId: number; tourNameSnapshot: string; bookingDate: Date; totalPrice: Prisma.Decimal },
): Promise<void> {
  const [tour, customer, staff] = await Promise.all([
    prisma.tour.findUnique({ where: { id: booking.tourId }, include: { guide: { include: { user: true } } } }),
    prisma.user.findUnique({ where: { userId: request.customerId } }),
    prisma.user.findMany({ where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] }, isActive: true } }),
  ])

  const recipients = new Set<string>(staff.map((u) => u.email))
  if (tour?.guide?.user.email) recipients.add(tour.guide.user.email)

  const bookingDateStr = booking.bookingDate.toISOString().slice(0, 10)

  if (recipients.size > 0) {
    await sendCancellationRequestStaffNotification({
      recipients: [...recipients],
      cancellationRequestId: request.id,
      bookingId: booking.id,
      customerName: customer?.fullName ?? 'Customer',
      customerEmail: customer?.email ?? 'unknown',
      tourName: booking.tourNameSnapshot,
      bookingDate: bookingDateStr,
      originalAmount: Number(booking.totalPrice),
      refundAmount: Number(request.refundAmount),
      refundMethodName: request.refundMethodNameSnapshot,
      refundDestination: request.refundDestination,
      reason: request.reason,
      requestedAt: request.createdAt.toISOString(),
    })
  }

  if (customer?.email) {
    await sendCancellationRequestSubmittedEmail({
      to: customer.email,
      customerName: customer.fullName ?? 'Customer',
      bookingId: booking.id,
      tourName: booking.tourNameSnapshot,
    })
  }
}

export async function getMyCancellationRequests(userId: number) {
  const rows = await prisma.cancellationRequest.findMany({
    where: { customerId: userId },
    orderBy: { createdAt: 'desc' },
    include: CANCELLATION_REQUEST_INCLUDE,
  })
  return rows.map(toPublicCancellationRequest)
}

export async function listCancellationRequests(filter?: { status?: CancellationRequestStatus }) {
  const rows = await prisma.cancellationRequest.findMany({
    where: filter?.status ? { status: filter.status } : undefined,
    orderBy: { createdAt: 'desc' },
    include: CANCELLATION_REQUEST_INCLUDE,
  })
  return rows.map(toPublicCancellationRequest)
}

export async function getCancellationRequest(id: number) {
  const row = await prisma.cancellationRequest.findUnique({ where: { id }, include: CANCELLATION_REQUEST_INCLUDE })
  if (!row) throw new ApiError(404, 'Cancellation request not found.')
  return toPublicCancellationRequest(row)
}

export async function approveCancellationRequest(actor: Actor, id: number) {
  const existing = await prisma.cancellationRequest.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Cancellation request not found.')
  if (existing.status !== 'PENDING') {
    throw new ApiError(400, 'Only a pending cancellation request can be approved.')
  }

  const updated = await prisma.cancellationRequest.update({
    where: { id },
    data: { status: 'APPROVED', approvedAt: new Date() },
    include: CANCELLATION_REQUEST_INCLUDE,
  })

  await recordAuditLog({ userId: actor.userId, role: actor.role, action: 'cancellationRequest.approve', entity: 'cancellation_requests', entityId: id })

  return toPublicCancellationRequest(updated)
}

export async function rejectCancellationRequest(actor: Actor, id: number, rejectionReason: string) {
  const existing = await prisma.cancellationRequest.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Cancellation request not found.')
  if (existing.status !== 'PENDING') {
    throw new ApiError(400, 'Only a pending cancellation request can be rejected.')
  }

  const [updated, booking, customer] = await prisma.$transaction([
    prisma.cancellationRequest.update({
      where: { id },
      data: { status: 'REJECTED', rejectedAt: new Date(), rejectionReason },
      include: CANCELLATION_REQUEST_INCLUDE,
    }),
    prisma.booking.findUniqueOrThrow({ where: { id: existing.bookingId } }),
    prisma.user.findUnique({ where: { userId: existing.customerId } }),
  ])

  await recordAuditLog({
    userId: actor.userId,
    role: actor.role,
    action: 'cancellationRequest.reject',
    entity: 'cancellation_requests',
    entityId: id,
    metadata: { rejectionReason },
  })

  if (customer?.email) {
    await sendCancellationRequestRejectedEmail({
      to: customer.email,
      customerName: customer.fullName ?? 'Customer',
      bookingId: booking.id,
      tourName: booking.tourNameSnapshot,
      rejectionReason,
    })
  }

  void createNotification({
    userId: existing.customerId,
    type: 'CANCELLATION_REQUEST_REJECTED',
    title: 'Cancellation request rejected',
    message: `Your cancellation request for booking JDM-${booking.id} was not approved.`,
    relatedEntityType: 'booking',
    relatedEntityId: booking.id,
  }).catch((error) => console.error('[cancellationRequest.service] Failed to create notification:', error))

  return toPublicCancellationRequest(updated)
}

/** Staff uploads proof the refund transfer was actually made -- allowed once APPROVED, or again
 *  (replacing the existing proof) while already REFUND_PROCESSING. Moves the request into
 *  REFUND_PROCESSING; never marks it REFUNDED by itself -- that's a separate, explicit step
 *  (completeRefund) so approval/proof-upload and "the refund is actually done" can never be
 *  conflated. */
export async function addRefundProof(actor: Actor, id: number, input: { fileUrl: string; fileName: string; fileType: string }) {
  const existing = await prisma.cancellationRequest.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Cancellation request not found.')
  if (existing.status !== 'APPROVED' && existing.status !== 'REFUND_PROCESSING') {
    throw new ApiError(400, 'Refund proof can only be uploaded for an approved cancellation request.')
  }

  const updated = await prisma.cancellationRequest.update({
    where: { id },
    data: {
      status: 'REFUND_PROCESSING',
      refundProofUrl: input.fileUrl,
      refundProofFileName: input.fileName,
      refundProofFileType: input.fileType,
    },
    include: CANCELLATION_REQUEST_INCLUDE,
  })

  await recordAuditLog({ userId: actor.userId, role: actor.role, action: 'cancellationRequest.refund_proof', entity: 'cancellation_requests', entityId: id })

  return toPublicCancellationRequest(updated)
}

/**
 * The refund has actually been sent and proven -- the only step that touches the Booking itself.
 * Reuses updateBookingStatus exactly as it already supports (its own comment anticipates this:
 * "REFUNDED for cancelling an already-paid booking"), so the CANCELLED-already-cancelled guard
 * and audit logging both come for free and stay perfectly consistent with every other booking
 * status transition in the app.
 */
export async function completeRefund(actor: Actor, id: number) {
  const existing = await prisma.cancellationRequest.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Cancellation request not found.')
  if (existing.status !== 'REFUND_PROCESSING' || !existing.refundProofUrl) {
    throw new ApiError(400, 'Refund proof must be uploaded before the refund can be marked completed.')
  }

  // The Booking transition happens first -- if it throws (e.g. already CANCELLED via some other
  // path), the CancellationRequest is left at REFUND_PROCESSING rather than being marked REFUNDED
  // while the booking itself never actually moved.
  const booking = await updateBookingStatus(actor, existing.bookingId, { status: 'CANCELLED', paymentStatus: 'REFUNDED' })

  const updated = await prisma.cancellationRequest.update({
    where: { id },
    data: { status: 'REFUNDED', refundedAt: new Date() },
    include: CANCELLATION_REQUEST_INCLUDE,
  })

  await recordAuditLog({ userId: actor.userId, role: actor.role, action: 'cancellationRequest.complete', entity: 'cancellation_requests', entityId: id })

  const customer = await prisma.user.findUnique({ where: { userId: existing.customerId } })
  if (customer?.email) {
    await sendCancellationRefundCompletedEmail({
      to: customer.email,
      customerName: customer.fullName ?? 'Customer',
      bookingId: booking.id,
      tourName: booking.tourNameSnapshot,
      bookingDate: booking.bookingDate.toISOString().slice(0, 10),
      refundAmount: Number(updated.refundAmount),
      refundMethodName: updated.refundMethodNameSnapshot,
    })
  }

  void createNotification({
    userId: existing.customerId,
    type: 'REFUND_COMPLETED',
    title: 'Refund completed',
    message: `Your refund for booking JDM-${booking.id} has been processed.`,
    relatedEntityType: 'booking',
    relatedEntityId: booking.id,
  }).catch((error) => console.error('[cancellationRequest.service] Failed to create notification:', error))

  return toPublicCancellationRequest(updated)
}
