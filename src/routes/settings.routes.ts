import {
  createSocialLink,
  deleteSocialLink,
  getContact,
  listSocialLinks,
  updateContact,
  updateSocialLink,
} from '../controllers/settings.controller'
import { requireAuth } from '../middleware/auth.middleware'
import { requireRole } from '../middleware/rbac'
import { validateBody } from '../middleware/validate'
import { apiErrorResponseSchema } from '../validators/common.validator'
import {
  contactSettingsResponseSchema,
  createSocialLinkSchema,
  deleteSocialLinkResponseSchema,
  socialLinkResponseSchema,
  socialLinksListResponseSchema,
  updateContactSettingsSchema,
  updateSocialLinkSchema,
} from '../validators/settings.validator'
import type { RouteDefinition } from './route-definition'

const staffOnly = [requireAuth, requireRole('SUPER_ADMIN', 'ADMIN')]

// Public reads — the frontend fetches these instead of hardcoding contact/social copy.
export const settingsRoutes: RouteDefinition[] = [
  {
    method: 'get',
    path: '/settings/contact',
    handler: getContact,
    summary: 'Get public contact/location settings',
    responses: {
      200: { description: 'Contact settings.', schema: contactSettingsResponseSchema },
    },
  },
  {
    method: 'get',
    path: '/settings/social-media',
    handler: listSocialLinks,
    summary: 'List social media links',
    responses: {
      200: { description: 'Social media links, ordered by displayOrder.', schema: socialLinksListResponseSchema },
    },
  },
  {
    method: 'put',
    path: '/settings/contact',
    handler: [...staffOnly, validateBody(updateContactSettingsSchema), updateContact],
    summary: 'Update contact/location settings',
    description: 'Staff only. Does not accept latitude/longitude -- coordinates are never invented from this endpoint.',
    request: { body: updateContactSettingsSchema },
    responses: {
      200: { description: 'Contact settings updated.', schema: contactSettingsResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN or ADMIN.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'post',
    path: '/settings/social-media',
    handler: [...staffOnly, validateBody(createSocialLinkSchema), createSocialLink],
    summary: 'Add a social media link',
    request: { body: createSocialLinkSchema },
    responses: {
      201: { description: 'Social media link created.', schema: socialLinkResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN or ADMIN.', schema: apiErrorResponseSchema },
      409: { description: 'This platform is already configured.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'put',
    path: '/settings/social-media/:id',
    handler: [...staffOnly, validateBody(updateSocialLinkSchema), updateSocialLink],
    summary: 'Update a social media link',
    request: { body: updateSocialLinkSchema },
    responses: {
      200: { description: 'Social media link updated.', schema: socialLinkResponseSchema },
      400: { description: 'id was not a positive integer.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN or ADMIN.', schema: apiErrorResponseSchema },
      404: { description: 'No social media link with that id.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'delete',
    path: '/settings/social-media/:id',
    handler: [...staffOnly, deleteSocialLink],
    summary: 'Delete a social media link',
    responses: {
      200: { description: 'Social media link deleted.', schema: deleteSocialLinkResponseSchema },
      400: { description: 'id was not a positive integer.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN or ADMIN.', schema: apiErrorResponseSchema },
      404: { description: 'No social media link with that id.', schema: apiErrorResponseSchema },
    },
  },
]
