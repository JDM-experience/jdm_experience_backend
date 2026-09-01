import type { Request, Response, NextFunction } from 'express'
import { ApiError } from '../middleware/errorHandler'
import * as paymentService from '../services/payment.service'
import { bookingIdForPaymentParamSchema, bookingIdRouteParamSchema } from '../validators/payment.validator'

function parseBookingIdParam(req: Request): number {
  const parsed = bookingIdRouteParamSchema.safeParse(req.params)
  if (!parsed.success) throw new ApiError(400, 'bookingId must be a positive integer.')
  return parsed.data.bookingId
}

function parseIdParam(req: Request): number {
  const parsed = bookingIdForPaymentParamSchema.safeParse(req.params)
  if (!parsed.success) throw new ApiError(400, 'id must be a positive integer.')
  return parsed.data.id
}

export async function record(req: Request, res: Response, next: NextFunction) {
  try {
    const payment = await paymentService.recordPayment(req.user!, req.body)
    res.status(201).json({ success: true, data: payment })
  } catch (error) {
    next(error)
  }
}

export async function listForBooking(req: Request, res: Response, next: NextFunction) {
  try {
    const payments = await paymentService.listPaymentsForBooking(req.user!, parseBookingIdParam(req))
    res.json({ success: true, data: payments })
  } catch (error) {
    next(error)
  }
}

export async function addProof(req: Request, res: Response, next: NextFunction) {
  try {
    const proof = await paymentService.addPaymentProof(req.user!, parseIdParam(req), req.body)
    res.status(201).json({ success: true, data: proof })
  } catch (error) {
    next(error)
  }
}

export async function listProofs(req: Request, res: Response, next: NextFunction) {
  try {
    const proofs = await paymentService.listPaymentProofs(req.user!, parseIdParam(req))
    res.json({ success: true, data: proofs })
  } catch (error) {
    next(error)
  }
}
