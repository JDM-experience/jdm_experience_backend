import { prisma } from '../config/prisma'
import { ApiError } from '../middleware/errorHandler'
import { recordAuditLog } from './auditLog.service'
import type { PaymentMethod, Role } from '../generated/prisma/client'

type Actor = { userId: number; role: Role }

function toPublicPaymentMethod(m: PaymentMethod) {
  return {
    id: m.id,
    name: m.name,
    description: m.description,
    imageUrl: m.imageUrl,
    isActive: m.isActive,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  }
}

/** Customers (and the public tour/checkout flow) only ever see active methods; staff managing
 *  them need to see disabled ones too — see payment-method.routes.ts for who gets which. */
export async function listPaymentMethods(filter?: { activeOnly?: boolean }) {
  const rows = await prisma.paymentMethod.findMany({
    where: filter?.activeOnly ? { isActive: true } : undefined,
    orderBy: { id: 'asc' },
  })
  return rows.map(toPublicPaymentMethod)
}

export async function getPaymentMethod(id: number) {
  const row = await prisma.paymentMethod.findUnique({ where: { id } })
  if (!row) throw new ApiError(404, 'Payment method not found.')
  return toPublicPaymentMethod(row)
}

export async function createPaymentMethod(
  actor: Actor,
  input: { name: string; description?: string; imageUrl?: string; isActive: boolean },
) {
  const row = await prisma.paymentMethod.create({ data: input })
  await recordAuditLog({ userId: actor.userId, action: 'payment_method.create', entity: 'payment_methods', entityId: row.id })
  return toPublicPaymentMethod(row)
}

export async function updatePaymentMethod(
  actor: Actor,
  id: number,
  input: { name?: string; description?: string; imageUrl?: string; isActive?: boolean },
) {
  const existing = await prisma.paymentMethod.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Payment method not found.')

  const row = await prisma.paymentMethod.update({ where: { id }, data: input })
  await recordAuditLog({ userId: actor.userId, action: 'payment_method.update', entity: 'payment_methods', entityId: id })
  return toPublicPaymentMethod(row)
}

/** Hard delete -- safe because Booking.paymentMethodId is SetNull on delete (a booking that used
 *  this method keeps its history, it just loses the live reference). SUPER_ADMIN may prefer
 *  disabling (isActive: false) instead so it stays visible/attributable in past bookings. */
export async function deletePaymentMethod(actor: Actor, id: number): Promise<void> {
  const existing = await prisma.paymentMethod.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Payment method not found.')

  await prisma.paymentMethod.delete({ where: { id } })
  await recordAuditLog({ userId: actor.userId, action: 'payment_method.delete', entity: 'payment_methods', entityId: id })
}
