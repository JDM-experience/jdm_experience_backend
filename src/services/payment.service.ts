import { prisma } from '../config/prisma'
import { ApiError } from '../middleware/errorHandler'
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
  }

  return toPublicPayment(payment)
}

export async function listPaymentsForBooking(actor: Actor, bookingId: number) {
  await assertBookingAccess(actor, bookingId)
  const rows = await prisma.payment.findMany({ where: { bookingId }, orderBy: { paymentDate: 'desc' } })
  return rows.map(toPublicPayment)
}

export async function addPaymentProof(
  actor: Actor,
  bookingId: number,
  input: { fileUrl: string; fileName: string; fileType: string },
) {
  await assertBookingAccess(actor, bookingId)

  const proof = await prisma.paymentProof.create({
    data: {
      bookingId,
      uploadedBy: actor.userId,
      fileUrl: input.fileUrl,
      fileName: input.fileName,
      fileType: input.fileType,
    },
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
