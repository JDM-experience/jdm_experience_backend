import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../config/prisma'
import { toPublicUser } from '../types/dto'
import * as userService from '../services/user.service'

/** Minimal proof that checkJwt (src/middleware/auth.middleware.ts) verifies real Auth0 tokens
 *  end to end — returns the verified token's subject claim. No user lookup here. */
export function ping(req: Request, res: Response) {
  res.json({ success: true, data: { sub: req.auth?.payload.sub } })
}

// Shape matches jdm_experience_frontend's ApiEnvelope<User> + User type exactly (that's what the
// frontend's Auth0 integration was built and tested against) -- see types/dto.ts's toPublicUser,
// the same DTO the admin /users endpoints use. `phone` is additive (from the Customer
// profile-extension row, absent for staff who have none) -- only this "me" endpoint resolves it,
// not the admin /users list, which has no reason to join Customer for every row.
export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const customer = await prisma.customer.findUnique({ where: { userId: req.user!.userId } })
    res.json({ success: true, data: { ...toPublicUser(req.user!), phone: customer?.phone ?? null } })
  } catch (error) {
    next(error)
  }
}

/** Self-service profile edit -- see userService.updateOwnProfile for why this is a distinct
 *  function from the SUPER_ADMIN-only PUT /users/:id. */
export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await userService.updateOwnProfile(req.user!, req.body)
    res.json({ success: true, data })
  } catch (error) {
    next(error)
  }
}
