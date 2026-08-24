import type { Request, Response, NextFunction } from 'express'
import { ApiError } from '../middleware/errorHandler'
import * as customerService from '../services/customer.service'
import { customerUserIdParamSchema } from '../validators/customer.validator'

function parseUserId(req: Request): number {
  const parsed = customerUserIdParamSchema.safeParse(req.params)
  if (!parsed.success) throw new ApiError(400, 'userId must be a positive integer.')
  return parsed.data.userId
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await customerService.listCustomers() })
  } catch (error) {
    next(error)
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await customerService.getCustomer(parseUserId(req)) })
  } catch (error) {
    next(error)
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await customerService.updateCustomerProfile(req.user!, parseUserId(req), req.body)
    res.json({ success: true, data: profile })
  } catch (error) {
    next(error)
  }
}
