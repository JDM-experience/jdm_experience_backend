import type { Request, Response, NextFunction } from 'express'
import { ApiError } from '../middleware/errorHandler'
import * as reviewService from '../services/review.service'
import { reviewIdParamSchema, tourIdParamSchema } from '../validators/review.validator'

function parseReviewId(req: Request): number {
  const parsed = reviewIdParamSchema.safeParse(req.params)
  if (!parsed.success) throw new ApiError(400, 'id must be a positive integer.')
  return parsed.data.id
}

function parseTourId(req: Request): number {
  const parsed = tourIdParamSchema.safeParse(req.params)
  if (!parsed.success) throw new ApiError(400, 'tourId must be a positive integer.')
  return parsed.data.tourId
}

export async function listForTour(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await reviewService.listReviewsForTour(parseTourId(req)) })
  } catch (error) {
    next(error)
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const review = await reviewService.createReview(req.user!, parseTourId(req), req.body)
    res.status(201).json({ success: true, data: review })
  } catch (error) {
    next(error)
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await reviewService.getReview(parseReviewId(req)) })
  } catch (error) {
    next(error)
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const review = await reviewService.updateReview(req.user!, parseReviewId(req), req.body)
    res.json({ success: true, data: review })
  } catch (error) {
    next(error)
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await reviewService.deleteReview(req.user!, parseReviewId(req))
    res.json({ success: true, data: null })
  } catch (error) {
    next(error)
  }
}
