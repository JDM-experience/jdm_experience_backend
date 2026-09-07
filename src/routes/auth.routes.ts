import { getMe, ping, updateMe } from '../controllers/auth.controller'
import { checkJwt, requireAuth } from '../middleware/auth.middleware'
import { validateBody } from '../middleware/validate'
import { apiErrorResponseSchema } from '../validators/common.validator'
import { authErrorResponseSchema, meResponseSchema, pingResponseSchema, updateOwnProfileSchema } from '../validators/auth.validator'
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
  {
    method: 'patch',
    path: '/auth/me',
    handler: [requireAuth, validateBody(updateOwnProfileSchema), updateMe],
    summary: "Update the authenticated user's own profile",
    description:
      'Only fullName/phone are ever accepted, regardless of what is sent -- role, email, isActive, ' +
      'and every other administrative field can never be changed through this endpoint. The caller ' +
      'is always determined from the Auth0 token, never a body/param userId.',
    request: { body: updateOwnProfileSchema },
    responses: {
      200: { description: 'Profile updated.', schema: meResponseSchema },
      401: { description: 'Missing, invalid, or expired Auth0 access token.', schema: authErrorResponseSchema },
      403: { description: 'Account has been deactivated.', schema: authErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
]
