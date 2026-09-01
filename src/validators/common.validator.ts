import { z } from 'zod'

export const errorResponseSchema = z
  .object({ error: z.unknown() })
  .meta({ id: 'ErrorResponse', description: 'Zod validation errors, or a plain message string.' })

// Set by src/middleware/errorHandler.ts (ApiError, UnauthorizedError, Prisma P2002, 500 fallback)
// -- the shape every route added since the RBAC/error-handling pass uses, matching the frontend's
// httpClient (extracts body.message from a failed response).
export const apiErrorResponseSchema = z
  .object({ success: z.literal(false), message: z.string() })
  .meta({ id: 'ApiErrorResponse', example: { success: false, message: 'Not found.' } })
