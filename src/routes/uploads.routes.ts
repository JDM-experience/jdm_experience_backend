import {
  createPaymentMethodImageUpload,
  createPaymentProofUpload,
  createRefundProofUpload,
  createTourImageUpload,
} from '../controllers/upload.controller'
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
  {
    method: 'post',
    path: '/uploads/payment-method-images',
    handler: [requireAuth, requireRole('SUPER_ADMIN'), validateBody(createTourImageUploadSchema), createPaymentMethodImageUpload],
    summary: 'Get a signed URL for uploading a payment method image (SUPER_ADMIN only)',
    description: 'Same signed-URL mechanism as /uploads/tour-images, different storage folder.',
    request: { body: createTourImageUploadSchema },
    responses: {
      201: { description: 'Signed upload URL issued.', schema: signedUploadResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
      500: { description: 'Storage is not configured or the sign request failed.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'post',
    path: '/uploads/payment-proofs',
    handler: [requireAuth, validateBody(createTourImageUploadSchema), createPaymentProofUpload],
    summary: 'Get a signed URL for uploading payment proof',
    description:
      'Any authenticated user may request a signed URL here -- booking ownership is checked ' +
      'separately when the resulting publicUrl is attached via POST /bookings/:id/payment-proof.',
    request: { body: createTourImageUploadSchema },
    responses: {
      201: { description: 'Signed upload URL issued.', schema: signedUploadResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
      500: { description: 'Storage is not configured or the sign request failed.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'post',
    path: '/uploads/refund-proofs',
    handler: [requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), validateBody(createTourImageUploadSchema), createRefundProofUpload],
    summary: 'Get a signed URL for uploading a refund proof (SUPER_ADMIN/ADMIN only)',
    description: 'Same signed-URL mechanism as /uploads/tour-images, different storage folder -- staff evidence of a processed refund.',
    request: { body: createTourImageUploadSchema },
    responses: {
      201: { description: 'Signed upload URL issued.', schema: signedUploadResponseSchema },
      401: { description: 'Missing or invalid bearer token.', schema: apiErrorResponseSchema },
      403: { description: 'Not SUPER_ADMIN or ADMIN.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed.', schema: apiErrorResponseSchema },
      500: { description: 'Storage is not configured or the sign request failed.', schema: apiErrorResponseSchema },
    },
  },
]
