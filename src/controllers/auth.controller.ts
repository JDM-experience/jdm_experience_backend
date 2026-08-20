import type { Request, Response } from 'express'

/** Minimal proof that checkJwt (src/middleware/auth.middleware.ts) verifies real Auth0 tokens
 *  end to end — returns the verified token's subject claim. No user lookup here (see JEA-40). */
export function ping(req: Request, res: Response) {
  res.json({ success: true, data: { sub: req.auth?.payload.sub } })
}
