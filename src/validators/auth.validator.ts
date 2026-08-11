import { z } from 'zod'

export const loginSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
})
