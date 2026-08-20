import type { Request, Response } from 'express'

/** Minimal proof that checkJwt (src/middleware/auth.middleware.ts) verifies real Auth0 tokens
 *  end to end — returns the verified token's subject claim. No user lookup here. */
export function ping(req: Request, res: Response) {
  res.json({ success: true, data: { sub: req.auth?.payload.sub } })
}

export function getMe(req: Request, res: Response) {
  const { userId, email, fullName, username, role, isActive, createdAt } = req.user!
  // Shape matches jdm_experience_frontend's ApiEnvelope<User> + User type exactly (that's what
  // the frontend's Auth0 integration was built and tested against) — { id, ... } keeps "id" as
  // the JSON key regardless of the DB/Prisma field being named userId. authProvider is hardcoded
  // since Auth0 is the only identity provider this backend has ever supported.
  res.json({
    success: true,
    data: {
      id: userId,
      email,
      fullName,
      username,
      role,
      authProvider: 'AUTH0',
      isActive,
      createdAt: createdAt.toISOString(),
    },
  })
}
