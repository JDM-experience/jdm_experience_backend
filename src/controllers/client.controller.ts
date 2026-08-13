import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { clientIdParamSchema } from '../validators/client.validator'

export async function getClient(req: Request, res: Response) {
  const parsed = clientIdParamSchema.safeParse(req.params)
  if (!parsed.success) {
    res.status(400).json({ error: z.flattenError(parsed.error) })
    return
  }

  const client = await prisma.client.findUnique({ where: { id: parsed.data.id } })
  if (!client) {
    res.status(404).json({ error: 'client not found' })
    return
  }

  res.json({ status: 'ok', client })
}
