import { z } from 'zod'

export const clientIdParamSchema = z
  .object({
    id: z.coerce.number().int().positive().meta({ example: 2 }),
  })
  .meta({ id: 'ClientIdParam' })

export const clientSchema = z
  .object({
    id: z.number().meta({ example: 2 }),
    firstName: z.string().meta({ example: 'John' }),
    lastName: z.string().meta({ example: 'doe' }),
    age: z.number().meta({ example: 20 }),
    createdAt: z.string().meta({ example: '2026-08-11T10:26:53.912Z' }),
  })
  .meta({ id: 'Client' })

export const getClientResponseSchema = z
  .object({ status: z.literal('ok'), client: clientSchema })
  .meta({ id: 'GetClientResponse' })
