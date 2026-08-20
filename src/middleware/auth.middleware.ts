import type { RequestHandler } from 'express'
import { auth, UnauthorizedError } from 'express-oauth2-jwt-bearer'
import { findOrCreateFromAuth0 } from '../services/user.service'

/**
 * Verifies an Auth0-issued access token's signature, issuer, audience, and expiry against the
 * tenant's JWKS (RS256, no manual jsonwebtoken/JWKS plumbing). On success, populates
 * `req.auth.payload` with the decoded claims (`sub`, etc.) — see express-oauth2-jwt-bearer's own
 * global Express.Request augmentation, no manual typing needed here.
 *
 * Only verifies the token itself — it does not look up or attach any local user record. See
 * `requireAuth` below for that.
 */
export const checkJwt = auth({
  audience: process.env.AUTH0_AUDIENCE,
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}/`,
})

/** Namespaced custom claim added by an Auth0 Post-Login Action — access tokens don't carry
 *  email/profile info by default. See README.md for the exact Action script required. */
const EMAIL_CLAIM = 'https://jdmexperience.dev/email'

/** Verifies the Auth0 bearer token (via `checkJwt`), then finds/creates the corresponding local
 *  `users` row (see services/user.service.ts) and attaches it as `req.user`. Errors are forwarded
 *  to the error-handling middleware in app.ts, which formats them as `{ success, message }`
 *  (matching jdm_experience_frontend's httpClient) with the right status. */
export const requireAuth: RequestHandler = (req, res, next) => {
  checkJwt(req, res, async (err) => {
    if (err) {
      next(err)
      return
    }

    try {
      const sub = req.auth?.payload.sub
      if (!sub) throw new UnauthorizedError('Not authenticated.')

      const email = req.auth?.payload[EMAIL_CLAIM] as string | undefined
      if (!email) {
        throw new UnauthorizedError(
          'Auth0 access token is missing the email claim — deploy the Post-Login Action described in README.md.',
        )
      }

      const user = await findOrCreateFromAuth0({ sub, email })
      if (!user.isActive) {
        res.status(403).json({ success: false, message: 'This account has been deactivated.' })
        return
      }

      req.user = user
      next()
    } catch (error) {
      next(error)
    }
  })
}
