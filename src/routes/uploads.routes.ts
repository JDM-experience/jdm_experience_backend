import { createTourImageUpload } from '../controllers/upload.controller'
import { requireAuth } from '../middleware/auth.middleware'
import { requireRole } from '../middleware/rbac'
import { validateBody } from '../middleware/validate'
import { apiErrorResponseSchema } from '../validators/common.validator'
import { createTourImageUploadSchema, signedUploadResponseSchema } from '../validators/upload.validator'
import type { RouteDefinition } from './route-definition'

export const uploadsRoutes: RouteDefinition[] = [
  {
    method: 'post',
    path: '/uploads/tour-images',
    handler: [
      requireAuth,
      requireRole('SUPER_ADMIN', 'ADMIN', 'TOUR_GUIDE'),
      validateBody(createTourImageUploadSchema),
      createTourImageUpload,
    ],
    summary: 'Get a signed URL for uploading a tour image',
    description:
      'Returns a one-time signed URL. The client PUTs the file bytes directly to Supabase Storage ' +
      '(`signedUrl`) — they never pass through this API — then sends `publicUrl` back as an image on ' +
      'POST /tours or POST /tours/:tourId/images. Allowed types: image/jpeg, image/png, image/webp, ' +
      'image/avif. Max file size is enforced by the storage bucket (5 MB).',
    request: { body: createTourImageUploadSchema },
    responses: {
      201: { description: 'Signed upload URL issued.', schema: signedUploadResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN, ADMIN, or TOUR_GUIDE.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
      500: { description: 'Storage is not configured or the sign request failed.', schema: apiErrorResponseSchema },
    },
  },
]
