import { z } from 'zod'

export const pingResponseSchema = z
  .object({
    success: z.literal(true),
    data: z.object({ sub: z.string().meta({ example: 'auth0|abc123' }) }),
  })
  .meta({ id: 'PingResponse' })

// Set by the error handler in app.ts — matches jdm_experience_frontend's httpClient, which
// extracts body.message from a failed response.
export const authErrorResponseSchema = z
  .object({ success: z.literal(false), message: z.string() })
  .meta({ id: 'AuthErrorResponse', example: { success: false, message: 'Unauthorized' } })

const meDataSchema = z
  .object({
    id: z.number().meta({ example: 1 }),
    email: z.string().meta({ example: 'jane@example.com' }),
    fullName: z.string().nullable().meta({ example: 'Jane Doe' }),
    username: z.string().nullable().meta({ example: null }),
    role: z.enum(['SUPER_ADMIN', 'ADMIN', 'TOUR_GUIDE', 'CUSTOMER']).meta({ example: 'CUSTOMER' }),
    authProvider: z.literal('AUTH0').meta({ example: 'AUTH0' }),
    isActive: z.boolean().meta({ example: true }),
    createdAt: z.string().meta({ example: '2026-08-11T10:26:53.912Z' }),
    phone: z.string().nullable().meta({ example: '+81-90-1234-5678' }),
  })
  .meta({ id: 'MeData' })

// { success, data } — matches the frontend's shared ApiEnvelope<T> convention
// (jdm_experience_frontend's src/services/httpClient.ts) — the frontend was built and tested
// against this envelope.
export const meResponseSchema = z
  .object({ success: z.literal(true), data: meDataSchema })
  .meta({ id: 'MeResponse' })

// Self-service profile edit -- only these two fields are ever accepted, regardless of what a
// client sends. role/email/isActive/userId can never reach userService.updateOwnProfile through
// this path.
export const updateOwnProfileSchema = z
  .object({
    fullName: z.string().trim().min(1, 'Please enter your full name.').max(255),
    phone: z.string().trim().max(50, 'Phone number is too long.'),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update.' })
