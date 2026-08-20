import { auth } from 'express-oauth2-jwt-bearer'

/**
 * Verifies an Auth0-issued access token's signature, issuer, audience, and expiry against the
 * tenant's JWKS (RS256, no manual jsonwebtoken/JWKS plumbing). On success, populates
 * `req.auth.payload` with the decoded claims (`sub`, etc.) — see express-oauth2-jwt-bearer's own
 * global Express.Request augmentation, no manual typing needed here.
 *
 * Only verifies the token itself — it does not look up or attach any local user record. That's
 * JIT provisioning (a separate concern) once this exists.
 */
export const checkJwt = auth({
  audience: process.env.AUTH0_AUDIENCE,
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}/`,
})
