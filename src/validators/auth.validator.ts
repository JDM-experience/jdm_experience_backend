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
