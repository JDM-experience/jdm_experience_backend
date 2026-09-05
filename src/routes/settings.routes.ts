import {
  createSocialLink,
  deleteSocialLink,
  getAbout,
  getContact,
  getPolicyForAdmin,
  listPolicies,
  listSocialLinks,
  updateAbout,
  updateContact,
  updatePolicy,
  updateSocialLink,
} from '../controllers/settings.controller'
import { requireAuth } from '../middleware/auth.middleware'
import { requireRole } from '../middleware/rbac'
import { validateBody } from '../middleware/validate'
import { apiErrorResponseSchema } from '../validators/common.validator'
import {
  aboutContentResponseSchema,
  contactSettingsResponseSchema,
  createSocialLinkSchema,
  deleteSocialLinkResponseSchema,
  policyPageResponseSchema,
  policyPagesListResponseSchema,
  socialLinkResponseSchema,
  socialLinksListResponseSchema,
  updateAboutContentSchema,
  updateContactSettingsSchema,
  updatePolicySchema,
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
  {
    method: 'get',
    path: '/settings/about',
    handler: getAbout,
    summary: 'Get the public About Us content',
    responses: {
      200: { description: 'About Us content, or null if never configured.', schema: aboutContentResponseSchema },
    },
  },
  {
    method: 'put',
    path: '/settings/about',
    handler: [...staffOnly, validateBody(updateAboutContentSchema), updateAbout],
    summary: 'Update the About Us content',
    request: { body: updateAboutContentSchema },
    responses: {
      200: { description: 'About Us content updated.', schema: aboutContentResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN or ADMIN.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'get',
    path: '/settings/policies',
    handler: listPolicies,
    summary: 'List policy pages that have content configured',
    description: 'Public. A policy type with no content configured yet is omitted entirely.',
    responses: {
      200: { description: 'Configured policy pages.', schema: policyPagesListResponseSchema },
    },
  },
  {
    method: 'get',
    path: '/settings/policies/:type/admin',
    handler: [...staffOnly, getPolicyForAdmin],
    summary: 'Get one policy page for editing, even if not yet configured',
    responses: {
      200: { description: 'The policy page (empty content if never configured).', schema: policyPageResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN or ADMIN.', schema: apiErrorResponseSchema },
      400: { description: 'type was not a valid policy type.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'put',
    path: '/settings/policies/:type',
    handler: [...staffOnly, validateBody(updatePolicySchema), updatePolicy],
    summary: 'Update one policy page',
    request: { body: updatePolicySchema },
    responses: {
      200: { description: 'Policy page updated.', schema: policyPageResponseSchema },
      400: { description: 'type was not a valid policy type.', schema: apiErrorResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN or ADMIN.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
    },
  },
]
