import { ping } from '../controllers/auth.controller'
import { checkJwt } from '../middleware/auth.middleware'
import { authErrorResponseSchema, pingResponseSchema } from '../validators/auth.validator'
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
]
