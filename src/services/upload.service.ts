import { randomUUID } from 'node:crypto'
import { createSignedUploadUrl, type SignedUpload } from '../config/storage'
import type { ALLOWED_IMAGE_TYPES } from '../validators/upload.validator'

type ImageContentType = (typeof ALLOWED_IMAGE_TYPES)[number]

/** `image/jpeg` -> `jpg`, everything else -> the subtype as-is (`png`, `webp`, `avif`). */
function extensionFor(contentType: ImageContentType): string {
  return contentType === 'image/jpeg' ? 'jpg' : contentType.slice('image/'.length)
}

/**
 * Issues a one-time signed URL for uploading a single tour image straight to Supabase Storage.
 * The file bytes never pass through this API (Vercel's ~4.5 MB function body limit, and there's
 * no reason to proxy them). Flow:
 *   1. client calls this endpoint -> gets { signedUrl, publicUrl }
 *   2. client PUTs the file to `signedUrl`
 *   3. client sends `publicUrl` back as an image on POST /tours or POST /tours/:tourId/images
 *
 * `fileName` is accepted for logging/future use but not trusted for the storage path — the object
 * key is a random UUID so uploads can't collide or overwrite each other.
 */
export async function createTourImageUploadUrl(input: {
  fileName: string
  contentType: ImageContentType
}): Promise<SignedUpload> {
  const objectPath = `tours/${randomUUID()}.${extensionFor(input.contentType)}`
  return createSignedUploadUrl(objectPath)
}

/** Same signed-URL mechanism, same bucket -- just a different folder prefix so a payment
 *  method's image and a tour's images can't collide. SUPER_ADMIN only (see uploads.routes.ts). */
export async function createPaymentMethodImageUploadUrl(input: {
  fileName: string
  contentType: ImageContentType
}): Promise<SignedUpload> {
  const objectPath = `payment-methods/${randomUUID()}.${extensionFor(input.contentType)}`
  return createSignedUploadUrl(objectPath)
}

/** Same mechanism again, for a customer's payment-proof screenshot/photo. Any authenticated user
 *  may request a signed URL here (booking ownership is checked separately, when the resulting
 *  publicUrl is actually attached via POST /bookings/:id/payment-proof — see payment.service.ts). */
export async function createPaymentProofUploadUrl(input: {
  fileName: string
  contentType: ImageContentType
}): Promise<SignedUpload> {
  const objectPath = `payment-proofs/${randomUUID()}.${extensionFor(input.contentType)}`
  return createSignedUploadUrl(objectPath)
}

/** Same mechanism again, for a staff member's proof-of-refund screenshot/receipt. SUPER_ADMIN/
 *  ADMIN only (see uploads.routes.ts) -- this is staff evidence, not a customer upload. */
export async function createRefundProofUploadUrl(input: {
  fileName: string
  contentType: ImageContentType
}): Promise<SignedUpload> {
  const objectPath = `refund-proofs/${randomUUID()}.${extensionFor(input.contentType)}`
  return createSignedUploadUrl(objectPath)
}
