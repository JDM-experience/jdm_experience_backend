import { z } from 'zod'

export const errorResponseSchema = z
  .object({ error: z.unknown() })
  .meta({ id: 'ErrorResponse', description: 'Zod validation errors, or a plain message string.' })
