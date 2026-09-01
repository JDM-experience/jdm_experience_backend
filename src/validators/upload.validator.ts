import { z } from 'zod'

/** Image types accepted for tour images. Kept in sync with the bucket's allowed_mime_types. */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const

export const createTourImageUploadSchema = z.object({
  fileName: z.string().trim().min(1, 'File name is required.').max(255),
  contentType: z.enum(ALLOWED_IMAGE_TYPES),
})

const signedUploadSchema = z
  .object({
    path: z.string().meta({ example: 'tours/9f8e7d6c-5b4a-4c3d-2e1f-0a1b2c3d4e5f.jpg' }),
    signedUrl: z.string().meta({
      example:
        'https://<ref>.supabase.co/storage/v1/object/upload/sign/tour-images/tours/9f8e7d6c-....jpg?token=eyJhbGciOiJIUzI1NiJ9...',
    }),
    token: z.string().meta({ example: 'eyJhbGciOiJIUzI1NiJ9...' }),
    publicUrl: z.string().meta({
      example: 'https://<ref>.supabase.co/storage/v1/object/public/tour-images/tours/9f8e7d6c-....jpg',
    }),
  })
  .meta({ id: 'SignedUpload' })

export const signedUploadResponseSchema = z
  .object({ success: z.literal(true), data: signedUploadSchema })
  .meta({ id: 'SignedUploadResponse' })
