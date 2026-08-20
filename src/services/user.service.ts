import { prisma } from '../config/prisma'

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
