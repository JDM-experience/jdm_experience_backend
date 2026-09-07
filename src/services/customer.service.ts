import { prisma } from '../config/prisma'
import { ApiError } from '../middleware/errorHandler'
import { toPublicUser } from '../types/dto'
import { recordAuditLog } from './auditLog.service'
import type { Customer, Prisma, Role, User } from '../generated/prisma/client'

type Actor = { userId: number; role: Role }

// No sandbox precedent for this domain (it never had a dedicated /customers endpoint -- see the
// sandbox<->frontend inventory) -- built fresh against the real User+Customer models rather than
// the frontend's legacy flat-User mock shape. Every CUSTOMER-role user is listed even if they
// haven't filled in a travel profile yet (profile fields come back null in that case).
function toCustomerProfile(user: User, customer: Customer | null) {
  return {
    ...toPublicUser(user),
    phone: customer?.phone ?? null,
    nationality: customer?.nationality ?? null,
    passportNumber: customer?.passportNumber ?? null,
    licenseNumber: customer?.licenseNumber ?? null,
    licenseCountry: customer?.licenseCountry ?? null,
    notes: customer?.notes ?? null,
  }
}

export async function listCustomers(filter?: { search?: string; isActive?: boolean }) {
  const where: Prisma.UserWhereInput = { role: 'CUSTOMER' }
  if (filter?.isActive !== undefined) where.isActive = filter.isActive
  if (filter?.search) {
    where.OR = [
      { fullName: { contains: filter.search, mode: 'insensitive' } },
      { email: { contains: filter.search, mode: 'insensitive' } },
    ]
  }

  const users = await prisma.user.findMany({ where, include: { customer: true }, orderBy: { userId: 'asc' } })
  return users.map((u) => toCustomerProfile(u, u.customer))
}

export async function getCustomer(userId: number) {
  const user = await prisma.user.findUnique({ where: { userId }, include: { customer: true } })
  if (!user || user.role !== 'CUSTOMER') throw new ApiError(404, 'Customer not found.')
  return toCustomerProfile(user, user.customer)
}

export async function updateCustomerProfile(
  actor: Actor,
  userId: number,
  input: {
    phone?: string
    nationality?: string
    passportNumber?: string
    licenseNumber?: string
    licenseCountry?: string
    notes?: string
  },
) {
  const user = await prisma.user.findUnique({ where: { userId } })
  if (!user || user.role !== 'CUSTOMER') throw new ApiError(404, 'Customer not found.')

  // No Customer row exists until the first profile edit -- upsert rather than assuming one.
  const customer = await prisma.customer.upsert({
    where: { userId },
    create: { userId, ...input },
    update: input,
  })

  await recordAuditLog({ userId: actor.userId, role: actor.role, action: 'customer.profile_update', entity: 'customers', entityId: userId })
  return toCustomerProfile(user, customer)
}
