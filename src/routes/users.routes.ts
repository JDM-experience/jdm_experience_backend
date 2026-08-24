import { create, getOne, list, remove, update } from '../controllers/user.controller'
import { requireAuth } from '../middleware/auth.middleware'
import { requireRole } from '../middleware/rbac'
import { validateBody, validateQuery } from '../middleware/validate'
import { apiErrorResponseSchema } from '../validators/common.validator'
import {
  createUserSchema,
  deactivateUserResponseSchema,
  updateUserSchema,
  userListQuerySchema,
  userResponseSchema,
  usersListResponseSchema,
} from '../validators/user.validator'
import type { RouteDefinition } from './route-definition'

// Admin gets read-only visibility (e.g. to see guide profiles) — creating/editing/deactivating
// staff accounts is Super Admin only.
export const usersRoutes: RouteDefinition[] = [
  {
    method: 'get',
    path: '/users',
    handler: [requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), validateQuery(userListQuerySchema), list],
    summary: 'List users, optionally filtered by role',
    request: { query: userListQuerySchema },
    responses: {
      200: { description: 'Users, optionally filtered by ?role=.', schema: usersListResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN or ADMIN.', schema: apiErrorResponseSchema },
      422: { description: 'Invalid role filter.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'get',
    path: '/users/:id',
    handler: [requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), getOne],
    summary: 'Get a user by id',
    responses: {
      200: { description: 'The user.', schema: userResponseSchema },
      400: { description: 'id was not a positive integer.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN or ADMIN.', schema: apiErrorResponseSchema },
      404: { description: 'No user with that id.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'post',
    path: '/users',
    handler: [requireAuth, requireRole('SUPER_ADMIN'), validateBody(createUserSchema), create],
    summary: 'Create a user (placeholder row until they sign in via Auth0)',
    description:
      'No password is set -- Auth0 is the sole identity provider. The row is linked on the first Auth0 login matching this email.',
    request: { body: createUserSchema },
    responses: {
      201: { description: 'User created.', schema: userResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN.', schema: apiErrorResponseSchema },
      409: { description: 'Email already registered.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'put',
    path: '/users/:id',
    handler: [requireAuth, requireRole('SUPER_ADMIN'), validateBody(updateUserSchema), update],
    summary: 'Update a user',
    request: { body: updateUserSchema },
    responses: {
      200: { description: 'User updated.', schema: userResponseSchema },
      400: { description: 'id was not a positive integer.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN.', schema: apiErrorResponseSchema },
      404: { description: 'No user with that id.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'delete',
    path: '/users/:id',
    handler: [requireAuth, requireRole('SUPER_ADMIN'), remove],
    summary: 'Deactivate a user (soft delete)',
    description: 'Sets isActive=false. A user cannot deactivate their own account.',
    responses: {
      200: { description: 'User deactivated.', schema: deactivateUserResponseSchema },
      400: { description: "id was not a positive integer, or the caller's own account.", schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN.', schema: apiErrorResponseSchema },
      404: { description: 'No user with that id.', schema: apiErrorResponseSchema },
    },
  },
]
