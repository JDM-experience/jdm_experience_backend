import { getMe, ping } from '../controllers/auth.controller'
import { checkJwt, requireAuth } from '../middleware/auth.middleware'
import { authErrorResponseSchema, meResponseSchema, pingResponseSchema } from '../validators/auth.validator'
import type { RouteDefinition } from './route-definition'

export const authRoutes: RouteDefinition[] = [
  {
    method: 'get',
    path: '/auth/ping',
    handler: [checkJwt, ping],
    summary: 'Verify a bearer token is valid (diagnostic)',
    description:
      'Requires Authorization: Bearer <Auth0 access token>. Verifies the token and echoes back its subject claim, no user lookup. Proves checkJwt is wired end to end; superseded by real protected routes as they land.',
    responses: {
      200: { description: 'Token is valid.', schema: pingResponseSchema },
      401: { description: 'Missing, invalid, or expired Auth0 access token.', schema: authErrorResponseSchema },
    },
  },
  {
    method: 'get',
    path: '/auth/me',
    handler: [requireAuth, getMe],
    summary: "Get the authenticated user's profile",
    description:
      'Requires Authorization: Bearer <Auth0 access token>. Finds-or-creates the local user row from the verified Auth0 identity on first call.',
    responses: {
      200: { description: 'Authenticated user profile.', schema: meResponseSchema },
      401: { description: 'Missing, invalid, or expired Auth0 access token.', schema: authErrorResponseSchema },
      403: { description: 'Account has been deactivated.', schema: authErrorResponseSchema },
    },
  },
]
