import { getOne, list, update } from '../controllers/customer.controller'
import { requireAuth } from '../middleware/auth.middleware'
import { requireRole } from '../middleware/rbac'
import { validateBody, validateQuery } from '../middleware/validate'
import { apiErrorResponseSchema } from '../validators/common.validator'
import {
  customerListQuerySchema,
  customerResponseSchema,
  customersListResponseSchema,
  updateCustomerProfileSchema,
} from '../validators/customer.validator'
import type { RouteDefinition } from './route-definition'

// No sandbox precedent -- built fresh, matching the real User+Customer models (not the
// frontend's legacy flat-User mock shape). Deactivating a customer reuses DELETE /users/:id
// (SUPER_ADMIN-only soft deactivate) rather than duplicating it here.
const staffOnly = [requireAuth, requireRole('SUPER_ADMIN', 'ADMIN')]

export const customersRoutes: RouteDefinition[] = [
  {
    method: 'get',
    path: '/customers',
    handler: staffOnly.concat([validateQuery(customerListQuerySchema), list]),
    summary: 'List customers (role=CUSTOMER users, with their travel profile)',
    description: 'search matches name/email (case-insensitive); isActive filters to "true"/"false".',
    request: { query: customerListQuerySchema },
    responses: {
      200: { description: 'Customers.', schema: customersListResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN or ADMIN.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'get',
    path: '/customers/:userId',
    handler: staffOnly.concat(getOne),
    summary: 'Get a customer by user id',
    responses: {
      200: { description: 'The customer.', schema: customerResponseSchema },
      400: { description: 'userId was not a positive integer.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN or ADMIN.', schema: apiErrorResponseSchema },
      404: { description: 'No customer with that user id.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'put',
    path: '/customers/:userId',
    handler: staffOnly.concat([validateBody(updateCustomerProfileSchema), update]),
    summary: "Update a customer's travel profile",
    description: 'Upserts the Customer row -- one may not exist yet if the customer has never had their profile edited.',
    request: { body: updateCustomerProfileSchema },
    responses: {
      200: { description: 'Customer profile updated.', schema: customerResponseSchema },
      400: { description: 'userId was not a positive integer.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN or ADMIN.', schema: apiErrorResponseSchema },
      404: { description: 'No customer with that user id.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
]
