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
