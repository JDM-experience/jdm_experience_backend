import { z } from 'zod'

export const clientIdParamSchema = z
  .object({
    id: z.coerce.number().int().positive().meta({ example: 2 }),
  })
  .meta({ id: 'ClientIdParam' })
