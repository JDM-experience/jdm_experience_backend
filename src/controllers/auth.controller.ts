import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { loginSchema } from '../validators/auth.validator'

// Placeholder until Auth0 is wired up. NOT real auth: first_name is treated
// as the username and last_name as the password, matched in plaintext
// against existing Client rows — no hashing, no session/token issuance. Only
// good enough to unblock testing until Auth0 replaces this.
export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: z.flattenError(parsed.error) })
    return
  }

  const { first_name, last_name } = parsed.data
  const client = await prisma.client.findFirst({
    where: { firstName: first_name, lastName: last_name },
  })

  if (!client) {
    res.status(401).json({ error: 'invalid credentials' })
    return
  }

  res.json({ status: 'ok', client })
}
