import { prisma } from '../config/prisma'
import { ApiError } from '../middleware/errorHandler'
import { toPublicUser, type PublicUser } from '../types/dto'
import { recordAuditLog } from './auditLog.service'
import type { Prisma, Role } from '../generated/prisma/client'

/**
 * Finds the local `users` row for an already-verified Auth0 identity, linking or creating it as
 * needed. Called on every authenticated request (see middleware/auth.middleware.ts).
 *
 * 1. Match by `auth0Sub` — the common case once a user has logged in at least once.
 * 2. Else match by `email` — links an Auth0 identity onto a pre-existing row.
 * 3. Else create a new `CUSTOMER` row — first-ever login for this identity.
 */
export async function findOrCreateFromAuth0(identity: { sub: string; email: string }) {
  const existing = await prisma.user.findUnique({ where: { auth0Sub: identity.sub } })
  if (existing) return existing

  const byEmail = await prisma.user.findUnique({ where: { email: identity.email } })
  if (byEmail) {
    return prisma.user.update({ where: { userId: byEmail.userId }, data: { auth0Sub: identity.sub } })
  }

  return prisma.user.create({
    data: { auth0Sub: identity.sub, email: identity.email, fullName: identity.email, role: 'CUSTOMER' },
  })
}

type Actor = { userId: number; role: Role }

/**
 * A User's `role` alone doesn't make them assignable to a tour — Tour.guideId points at a
 * TourGuide *profile* row (phone/bio/active), not a User directly (see schema.prisma). Without
 * this, promoting someone to TOUR_GUIDE (here, or by editing their role) left them with no way to
 * ever be assigned a tour: GET /tours/guides only lists rows from this table, and createTour's
 * own TOUR_GUIDE auto-assignment looks the profile up the same way. Idempotent -- safe to call
 * even if a profile already exists.
 */
async function ensureTourGuideProfile(userId: number): Promise<void> {
  await prisma.tourGuide.upsert({
    where: { userId },
    create: { userId },
    update: {},
  })
}

export async function listUsers(filter?: { role?: Role; search?: string }): Promise<PublicUser[]> {
  const where: Prisma.UserWhereInput = {}
  if (filter?.role) where.role = filter.role
  if (filter?.search) {
    where.OR = [
      { fullName: { contains: filter.search, mode: 'insensitive' } },
      { email: { contains: filter.search, mode: 'insensitive' } },
    ]
  }
  const users = await prisma.user.findMany({ where, orderBy: { userId: 'asc' } })
  return users.map(toPublicUser)
}

export async function getUser(id: number): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { userId: id } })
  if (!user) throw new ApiError(404, 'User not found.')
  return toPublicUser(user)
}

export async function createUser(
  actor: Actor,
  input: { fullName: string; email: string; role: Role },
): Promise<PublicUser> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing) throw new ApiError(409, 'Email is already registered.')

  // No password to set — Auth0 is the sole identity provider. This row is a placeholder until
  // the person signs in via Auth0 with this exact email, at which point findOrCreateFromAuth0
  // links it and they inherit the role assigned here.
  const user = await prisma.user.create({
    data: { fullName: input.fullName, email: input.email, role: input.role },
  })

  if (input.role === 'TOUR_GUIDE') {
    await ensureTourGuideProfile(user.userId)
  }

  await recordAuditLog({
    userId: actor.userId,
    role: actor.role,
    action: 'user.create',
    entity: 'users',
    entityId: user.userId,
    metadata: { role: input.role },
  })

  return toPublicUser(user)
}

export async function updateUser(
  actor: Actor,
  targetId: number,
  input: { fullName?: string; email?: string; role?: Role; isActive?: boolean },
): Promise<PublicUser> {
  const target = await prisma.user.findUnique({ where: { userId: targetId } })
  if (!target) throw new ApiError(404, 'User not found.')

  const updated = await prisma.user.update({
    where: { userId: targetId },
    data: { fullName: input.fullName, email: input.email, role: input.role, isActive: input.isActive },
  })

  if (input.role === 'TOUR_GUIDE') {
    await ensureTourGuideProfile(targetId)
  }

  // One diff-style log per call covering whatever actually changed (name/email/role/isActive),
  // rather than a separate hardcoded log per field -- "User updated" and "User role changed" are
  // both satisfied by the same entry, since the metadata naturally includes `role` whenever that's
  // what changed.
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  if (input.fullName !== undefined && input.fullName !== target.fullName) changes.fullName = { from: target.fullName, to: input.fullName }
  if (input.email !== undefined && input.email !== target.email) changes.email = { from: target.email, to: input.email }
  if (input.role !== undefined && input.role !== target.role) changes.role = { from: target.role, to: input.role }
  if (input.isActive !== undefined && input.isActive !== target.isActive) changes.isActive = { from: target.isActive, to: input.isActive }

  if (Object.keys(changes).length > 0) {
    await recordAuditLog({
      userId: actor.userId,
      role: actor.role,
      action: 'user.update',
      entity: 'users',
      entityId: targetId,
      metadata: changes,
    })
  }

  return toPublicUser(updated)
}

export async function deactivateUser(actor: Actor, targetId: number): Promise<void> {
  const target = await prisma.user.findUnique({ where: { userId: targetId } })
  if (!target) throw new ApiError(404, 'User not found.')
  if (target.userId === actor.userId) {
    throw new ApiError(400, 'You cannot deactivate your own account.')
  }

  await prisma.user.update({ where: { userId: targetId }, data: { isActive: false } })
  await recordAuditLog({ userId: actor.userId, role: actor.role, action: 'user.deactivate', entity: 'users', entityId: targetId })
}

/**
 * Self-service profile edit -- distinct from updateUser (SUPER_ADMIN-only, any user, any field).
 * Only ever touches the caller's own row (there is no targetId parameter -- structurally
 * impossible to edit anyone else), and only fullName/phone are accepted regardless of what a
 * client sends (enforced by updateOwnProfileSchema, not just by this function's signature).
 * Phone lives on the Customer profile-extension row (same upsert customer.service.ts's
 * updateCustomerProfile already does for the staff-facing edit) -- logged under its own
 * `user.profile_update` action so a self-edit is never confused with a staff-driven
 * `customer.profile_update` in the audit trail.
 */
export async function updateOwnProfile(actor: Actor, input: { fullName?: string; phone?: string }) {
  const changes: Record<string, unknown> = {}

  if (input.fullName !== undefined) {
    await prisma.user.update({ where: { userId: actor.userId }, data: { fullName: input.fullName } })
    changes.fullName = input.fullName
  }
  if (input.phone !== undefined) {
    await prisma.customer.upsert({
      where: { userId: actor.userId },
      create: { userId: actor.userId, phone: input.phone },
      update: { phone: input.phone },
    })
    changes.phone = input.phone
  }

  if (Object.keys(changes).length > 0) {
    await recordAuditLog({
      userId: actor.userId,
      role: actor.role,
      action: 'user.profile_update',
      entity: 'users',
      entityId: actor.userId,
      metadata: changes,
    })
  }

  const [user, customer] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { userId: actor.userId } }),
    prisma.customer.findUnique({ where: { userId: actor.userId } }),
  ])
  return { ...toPublicUser(user), phone: customer?.phone ?? null }
}
