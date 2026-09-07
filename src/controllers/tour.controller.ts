import type { Request, Response, NextFunction } from 'express'
import { ApiError } from '../middleware/errorHandler'
import * as tourService from '../services/tour.service'
import type { TourSortBy } from '../services/tour.service'
import { tourChildParamSchema, tourIdParamSchema, tourImageParamSchema } from '../validators/tour.validator'
import type { TourStatus } from '../generated/prisma/client'

function parseParams<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success || parsed.data === undefined) throw new ApiError(400, 'Invalid path parameters.')
  return parsed.data
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    // req.query was already validated + whitelisted by validateQuery(tourListQuerySchema) — see
    // tour.validator.ts's tourSortByEnum for the actual sortBy whitelist enforcement.
    const status = req.query.status as TourStatus | undefined
    const search = req.query.search as string | undefined
    const minPrice = req.query.minPrice as number | undefined
    const maxPrice = req.query.maxPrice as number | undefined
    const sortBy = req.query.sortBy as TourSortBy | undefined
    const sortOrder = req.query.sortOrder as 'asc' | 'desc' | undefined
    res.json({ success: true, data: await tourService.listTours({ status, search, minPrice, maxPrice, sortBy, sortOrder }) })
  } catch (error) {
    next(error)
  }
}

export async function myTours(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await tourService.listMyTours(req.user!.userId) })
  } catch (error) {
    next(error)
  }
}

export async function getContact(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = parseParams(tourIdParamSchema, req.params)
    res.json({ success: true, data: await tourService.getTourContact(id) })
  } catch (error) {
    next(error)
  }
}

export async function updateContact(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = parseParams(tourIdParamSchema, req.params)
    res.json({ success: true, data: await tourService.updateTourContact(req.user!, id, req.body) })
  } catch (error) {
    next(error)
  }
}

export async function listGuides(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await tourService.listTourGuides() })
  } catch (error) {
    next(error)
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = parseParams(tourIdParamSchema, req.params)
    res.json({ success: true, data: await tourService.getTour(id) })
  } catch (error) {
    next(error)
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const tour = await tourService.createTour(req.user!, req.body)
    res.status(201).json({ success: true, data: tour })
  } catch (error) {
    next(error)
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = parseParams(tourIdParamSchema, req.params)
    const tour = await tourService.updateTour(req.user!, id, req.body)
    res.json({ success: true, data: tour })
  } catch (error) {
    next(error)
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = parseParams(tourIdParamSchema, req.params)
    await tourService.deleteTour(req.user!, id)
    res.json({ success: true, data: null })
  } catch (error) {
    next(error)
  }
}

export async function confirm(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = parseParams(tourIdParamSchema, req.params)
    const tour = await tourService.confirmTour(req.user!, id)
    res.json({ success: true, data: tour })
  } catch (error) {
    next(error)
  }
}

export async function addImage(req: Request, res: Response, next: NextFunction) {
  try {
    const { tourId } = parseParams(tourChildParamSchema, req.params)
    const image = await tourService.addTourImage(tourId, req.body)
    res.status(201).json({ success: true, data: image })
  } catch (error) {
    next(error)
  }
}

export async function removeImage(req: Request, res: Response, next: NextFunction) {
  try {
    const { tourId, imageId } = parseParams(tourImageParamSchema, req.params)
    await tourService.removeTourImage(tourId, imageId)
    res.json({ success: true, data: null })
  } catch (error) {
    next(error)
  }
}

export async function bookedDates(req: Request, res: Response, next: NextFunction) {
  try {
    const { tourId } = parseParams(tourChildParamSchema, req.params)
    res.json({ success: true, data: await tourService.listBookedDates(tourId) })
  } catch (error) {
    next(error)
  }
}
