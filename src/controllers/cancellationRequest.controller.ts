import type { Request, Response, NextFunction } from 'express'
import { ApiError } from '../middleware/errorHandler'
import * as cancellationRequestService from '../services/cancellationRequest.service'
import { cancellationRequestIdParamSchema } from '../validators/cancellationRequest.validator'
import type { CancellationRequestStatus } from '../generated/prisma/client'

function parseId(req: Request): number {
  const parsed = cancellationRequestIdParamSchema.safeParse(req.params)
  if (!parsed.success) throw new ApiError(400, 'id must be a positive integer.')
  return parsed.data.id
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const { bookingId, ...input } = req.body
    const request = await cancellationRequestService.requestCancellation(req.user!, bookingId, input)
    res.status(201).json({ success: true, data: request })
  } catch (error) {
    next(error)
  }
}

export async function mine(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await cancellationRequestService.getMyCancellationRequests(req.user!.userId) })
  } catch (error) {
    next(error)
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const status = req.query.status as CancellationRequestStatus | undefined
    res.json({ success: true, data: await cancellationRequestService.listCancellationRequests({ status }) })
  } catch (error) {
    next(error)
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await cancellationRequestService.getCancellationRequest(parseId(req)) })
  } catch (error) {
    next(error)
  }
}

export async function approve(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await cancellationRequestService.approveCancellationRequest(req.user!, parseId(req)) })
  } catch (error) {
    next(error)
  }
}

export async function reject(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await cancellationRequestService.rejectCancellationRequest(req.user!, parseId(req), req.body.rejectionReason)
    res.json({ success: true, data })
  } catch (error) {
    next(error)
  }
}

export async function addRefundProof(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await cancellationRequestService.addRefundProof(req.user!, parseId(req), req.body)
    res.status(201).json({ success: true, data })
  } catch (error) {
    next(error)
  }
}

export async function complete(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await cancellationRequestService.completeRefund(req.user!, parseId(req)) })
  } catch (error) {
    next(error)
  }
}
