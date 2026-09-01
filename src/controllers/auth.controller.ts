import type { Request, Response } from 'express'
import { toPublicUser } from '../types/dto'

/** Minimal proof that checkJwt (src/middleware/auth.middleware.ts) verifies real Auth0 tokens
 *  end to end — returns the verified token's subject claim. No user lookup here. */
export function ping(req: Request, res: Response) {
  res.json({ success: true, data: { sub: req.auth?.payload.sub } })
}

// Shape matches jdm_experience_frontend's ApiEnvelope<User> + User type exactly (that's what the
// frontend's Auth0 integration was built and tested against) -- see types/dto.ts's toPublicUser,
// the same DTO the admin /users endpoints use.
export function getMe(req: Request, res: Response) {
  res.json({ success: true, data: toPublicUser(req.user!) })
}
