import { prisma } from '../config/prisma'
import { ApiError } from '../middleware/errorHandler'
import { toPublicUser, type PublicUser } from '../types/dto'
import { recordAuditLog } from './auditLog.service'
import type { Role } from '../generated/prisma/client'

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

export async function listUsers(filter?: { role?: Role }): Promise<PublicUser[]> {
  const users = await prisma.user.findMany({ where: filter?.role ? { role: filter.role } : undefined, orderBy: { userId: 'asc' } })
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

  if (input.role && input.role !== target.role) {
    await recordAuditLog({
      userId: actor.userId,
      action: 'user.role_change',
      entity: 'users',
      entityId: targetId,
      metadata: { from: target.role, to: input.role },
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
  await recordAuditLog({ userId: actor.userId, action: 'user.deactivate', entity: 'users', entityId: targetId })
}
