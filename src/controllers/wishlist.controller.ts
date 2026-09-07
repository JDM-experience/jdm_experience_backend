import type { Request, Response, NextFunction } from 'express'
import { ApiError } from '../middleware/errorHandler'
import * as wishlistService from '../services/wishlist.service'
import { wishlistTourIdParamSchema } from '../validators/wishlist.validator'

function parseTourId(req: Request): number {
  const parsed = wishlistTourIdParamSchema.safeParse(req.params)
  if (!parsed.success) throw new ApiError(400, 'tourId must be a positive integer.')
  return parsed.data.tourId
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await wishlistService.listMyWishlist(req.user!.userId) })
  } catch (error) {
    next(error)
  }
}

export async function add(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await wishlistService.addToWishlist(req.user!.userId, req.body.tourId)
    res.status(201).json({ success: true, data: item })
  } catch (error) {
    next(error)
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await wishlistService.removeFromWishlist(req.user!.userId, parseTourId(req))
    res.json({ success: true, data: null })
  } catch (error) {
    next(error)
  }
}
