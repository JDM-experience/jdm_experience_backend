import { prisma } from '../config/prisma'
import { ApiError } from '../middleware/errorHandler'
import { recordAuditLog } from './auditLog.service'
import { sendPaymentProofSubmittedEmail } from './email.service'
import { createNotification } from './notification.service'
import type { Payment, PaymentStatus, Role } from '../generated/prisma/client'

type Actor = { userId: number; role: Role }

const isStaff = (actor: Actor) => actor.role === 'SUPER_ADMIN' || actor.role === 'ADMIN'

function toPublicPayment(p: Payment) {
  return {
    id: p.id,
    bookingId: p.bookingId,
    provider: p.provider,
    amount: Number(p.amount),
    currency: p.currency,
    status: p.status,
    paymentMethod: p.paymentMethod,
    paymentDate: p.paymentDate,
    paidAt: p.paidAt,
    transactionRef: p.transactionRef,
  }
}

async function assertBookingAccess(actor: Actor, bookingId: number) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } })
  if (!booking) throw new ApiError(404, 'Booking not found.')
  if (!isStaff(actor) && booking.userId !== actor.userId) {
    throw new ApiError(403, 'You are not authorized to access this booking.')
  }
  return booking
}

/**
 * Records a payment against a booking. No real payment gateway is wired up yet (provider
 * undecided — PayMongo/Stripe/etc.) — this is the schema + service ready for one to plug into.
 * Never persists card numbers/CVVs/PINs.
 */
export async function recordPayment(
  actor: Actor,
  input: {
    bookingId: number
    amount: number
    provider?: string
    paymentMethod?: string
    transactionRef?: string
    status: PaymentStatus
  },
) {
  const booking = await prisma.booking.findUnique({ where: { id: input.bookingId } })
  if (!booking) throw new ApiError(404, 'Booking not found.')

  const payment = await prisma.payment.create({
    data: {
      bookingId: input.bookingId,
      amount: input.amount,
      currency: booking.currency,
      provider: input.provider,
      paymentMethod: input.paymentMethod,
      transactionRef: input.transactionRef,
      status: input.status,
      paidAt: input.status === 'PAID' ? new Date() : null,
    },
  })

  if (input.status === 'PAID') {
    await prisma.booking.update({ where: { id: input.bookingId }, data: { paymentStatus: 'PAID' } })

    void createNotification({
      userId: booking.userId,
      type: 'PAYMENT_CONFIRMED',
      title: 'Payment confirmed',
      message: `Your payment for booking JDM-${booking.id} has been confirmed.`,
      relatedEntityType: 'booking',
      relatedEntityId: booking.id,
    }).catch((error) => console.error('[payment.service] Failed to create notification:', error))
  }

  await recordAuditLog({
    userId: actor.userId,
    role: actor.role,
    action: 'payment.record',
    entity: 'payments',
    entityId: payment.id,
    metadata: { bookingId: input.bookingId, amount: input.amount, status: input.status },
  })

  return toPublicPayment(payment)
}

export async function listPaymentsForBooking(actor: Actor, bookingId: number) {
  await assertBookingAccess(actor, bookingId)
  const rows = await prisma.payment.findMany({ where: { bookingId }, orderBy: { paymentDate: 'desc' } })
  return rows.map(toPublicPayment)
}

/**
 * Attaches payment-proof metadata to a booking and notifies SUPER_ADMIN and the tour's own owning
 * Tour Guide only (never a plain ADMIN, and never an unrelated Tour Guide) -- recipients are
 * looked up fresh from the database every time, never hardcoded. Moves paymentStatus UNPAID ->
 * PENDING ("payment submitted, awaiting staff review") -- this never confirms the booking itself;
 * only an explicit staff action (PUT /bookings/:id, status=CONFIRMED) does that, in
 * booking.service.ts.
 */
export async function addPaymentProof(
  actor: Actor,
  bookingId: number,
  input: { fileUrl: string; fileName: string; fileType: string },
) {
  const booking = await assertBookingAccess(actor, bookingId)

  const [proof] = await prisma.$transaction([
    prisma.paymentProof.create({
      data: { bookingId, uploadedBy: actor.userId, fileUrl: input.fileUrl, fileName: input.fileName, fileType: input.fileType },
    }),
    ...(booking.paymentStatus === 'UNPAID'
      ? [prisma.booking.update({ where: { id: bookingId }, data: { paymentStatus: 'PENDING' } })]
      : []),
  ])

  void notifyPaymentProofSubmitted(booking, proof).catch((error) => {
    console.error('[payment.service] Failed to send payment-proof notification emails:', error)
  })

  await recordAuditLog({
    userId: actor.userId,
    role: actor.role,
    action: 'payment.proof_upload',
    entity: 'payment_proofs',
    entityId: proof.id,
    metadata: { bookingId },
  })

  return {
    id: proof.id,
    bookingId: proof.bookingId,
    uploadedBy: proof.uploadedBy,
    fileUrl: proof.fileUrl,
    fileName: proof.fileName,
    fileType: proof.fileType,
    createdAt: proof.createdAt,
  }
}

/** Exported for reuse by booking.service.ts's createBooking, which now creates the Booking and
 *  its first PaymentProof together (checkout requires proof up front) rather than as two
 *  separate calls -- same notification, same recipients, just triggered from a different place.
 *
 *  Recipients are targeted, not broadcast to every staff account: SUPER_ADMIN (the role with full
 *  system oversight) plus the tour's own assigned Tour Guide (if any) -- deliberately excludes the
 *  plain ADMIN role, mirroring how the customer confirmation email only ever reaches the one
 *  customer actually involved, not every account with a similar role. */
export async function notifyPaymentProofSubmitted(
  booking: { id: number; tourId: number; userId: number; tourNameSnapshot: string; bookingDate: Date; paymentMethodId: number | null },
  proof: { fileUrl: string; createdAt: Date },
): Promise<void> {
  const [tour, customer, superAdmins, paymentMethod] = await Promise.all([
    prisma.tour.findUnique({ where: { id: booking.tourId }, include: { guide: { include: { user: true } } } }),
    prisma.user.findUnique({ where: { userId: booking.userId } }),
    prisma.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true } }),
    booking.paymentMethodId ? prisma.paymentMethod.findUnique({ where: { id: booking.paymentMethodId } }) : null,
  ])

  const recipients = new Set<string>(superAdmins.map((u) => u.email))
  if (tour?.guide?.user.email) recipients.add(tour.guide.user.email)
  if (recipients.size === 0) return

  await sendPaymentProofSubmittedEmail({
    recipients: [...recipients],
    bookingId: booking.id,
    tourName: booking.tourNameSnapshot,
    bookingDate: booking.bookingDate.toISOString().slice(0, 10),
    customerName: customer?.fullName ?? 'Customer',
    customerEmail: customer?.email ?? 'unknown',
    paymentMethodName: paymentMethod?.name ?? null,
    proofUrl: proof.fileUrl,
    submittedAt: proof.createdAt.toISOString(),
    status: 'PAYMENT_SUBMITTED',
  })
}

export async function listPaymentProofs(actor: Actor, bookingId: number) {
  await assertBookingAccess(actor, bookingId)

  const rows = await prisma.paymentProof.findMany({ where: { bookingId }, orderBy: { createdAt: 'desc' } })
  return rows.map((p) => ({
    id: p.id,
    bookingId: p.bookingId,
    uploadedBy: p.uploadedBy,
    fileUrl: p.fileUrl,
    fileName: p.fileName,
    fileType: p.fileType,
    createdAt: p.createdAt,
  }))
}
