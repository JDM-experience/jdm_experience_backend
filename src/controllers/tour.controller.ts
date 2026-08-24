import type { Request, Response, NextFunction } from 'express'
import { ApiError } from '../middleware/errorHandler'
import * as tourService from '../services/tour.service'
import {
  tourAvailabilityItemParamSchema,
  tourAvailabilityParamSchema,
  tourIdParamSchema,
  tourImageParamSchema,
} from '../validators/tour.validator'
import type { TourStatus } from '../generated/prisma/client'

function parseParams<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success || parsed.data === undefined) throw new ApiError(400, 'Invalid path parameters.')
  return parsed.data
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const status = req.query.status as TourStatus | undefined
    res.json({ success: true, data: await tourService.listTours(status ? { status } : undefined) })
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
    await tourService.archiveTour(req.user!, id)
    res.json({ success: true, data: null })
  } catch (error) {
    next(error)
  }
}

export async function addImage(req: Request, res: Response, next: NextFunction) {
  try {
    const { tourId } = parseParams(tourAvailabilityParamSchema, req.params)
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

export async function listAvailability(req: Request, res: Response, next: NextFunction) {
  try {
    const { tourId } = parseParams(tourAvailabilityParamSchema, req.params)
    res.json({ success: true, data: await tourService.listAvailability(tourId) })
  } catch (error) {
    next(error)
  }
}

export async function createAvailability(req: Request, res: Response, next: NextFunction) {
  try {
    const { tourId } = parseParams(tourAvailabilityParamSchema, req.params)
    const row = await tourService.createAvailability(tourId, req.body)
    res.status(201).json({ success: true, data: row })
  } catch (error) {
    next(error)
  }
}

export async function updateAvailability(req: Request, res: Response, next: NextFunction) {
  try {
    const { tourId, availabilityId } = parseParams(tourAvailabilityItemParamSchema, req.params)
    const row = await tourService.updateAvailability(tourId, availabilityId, req.body)
    res.json({ success: true, data: row })
  } catch (error) {
    next(error)
  }
}

export async function removeAvailability(req: Request, res: Response, next: NextFunction) {
  try {
    const { tourId, availabilityId } = parseParams(tourAvailabilityItemParamSchema, req.params)
    await tourService.removeAvailability(tourId, availabilityId)
    res.json({ success: true, data: null })
  } catch (error) {
    next(error)
  }
}
