import type { Request, Response, NextFunction } from 'express'
import { ApiError } from '../middleware/errorHandler'
import * as paymentMethodService from '../services/paymentMethod.service'
import { paymentMethodIdParamSchema } from '../validators/paymentMethod.validator'

function parseId(params: unknown): number {
  const parsed = paymentMethodIdParamSchema.safeParse(params)
  if (!parsed.success) throw new ApiError(400, 'id must be a positive integer.')
  return parsed.data.id
}

/** Any authenticated user may call this (booking already requires login) -- a CUSTOMER only ever
 *  sees active methods; staff managing them see everything, active or not. */
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const activeOnly = req.user!.role === 'CUSTOMER'
    res.json({ success: true, data: await paymentMethodService.listPaymentMethods({ activeOnly }) })
  } catch (error) {
    next(error)
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseId(req.params)
    res.json({ success: true, data: await paymentMethodService.getPaymentMethod(id) })
  } catch (error) {
    next(error)
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const method = await paymentMethodService.createPaymentMethod(req.user!, req.body)
    res.status(201).json({ success: true, data: method })
  } catch (error) {
    next(error)
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseId(req.params)
    const method = await paymentMethodService.updatePaymentMethod(req.user!, id, req.body)
    res.json({ success: true, data: method })
  } catch (error) {
    next(error)
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseId(req.params)
    await paymentMethodService.deletePaymentMethod(req.user!, id)
    res.json({ success: true, data: null })
  } catch (error) {
    next(error)
  }
}
