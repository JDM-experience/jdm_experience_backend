import type { Request, Response, NextFunction } from 'express'
import { ApiError } from '../middleware/errorHandler'
import * as bookingService from '../services/booking.service'
import type { BookingListFilter } from '../services/booking.service'
import { bookingIdParamSchema } from '../validators/booking.validator'

function parseBookingId(req: Request): number {
  const parsed = bookingIdParamSchema.safeParse(req.params)
  if (!parsed.success) throw new ApiError(400, 'id must be a positive integer.')
  return parsed.data.id
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const booking = await bookingService.createBooking(req.user!, req.body)
    res.status(201).json({ success: true, data: booking })
  } catch (error) {
    next(error)
  }
}

export async function myBookings(req: Request, res: Response, next: NextFunction) {
  try {
    const filter = req.query as unknown as BookingListFilter
    res.json({ success: true, data: await bookingService.getMyBookings(req.user!.userId, filter) })
  } catch (error) {
    next(error)
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const filter = req.query as unknown as BookingListFilter
    res.json({ success: true, data: await bookingService.listBookings(req.user!, filter) })
  } catch (error) {
    next(error)
  }
}

export async function cancel(req: Request, res: Response, next: NextFunction) {
  try {
    const booking = await bookingService.cancelOwnBooking(req.user!, parseBookingId(req))
    res.json({ success: true, data: booking })
  } catch (error) {
    next(error)
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await bookingService.getBooking(parseBookingId(req)) })
  } catch (error) {
    next(error)
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const booking = await bookingService.updateBookingStatus(req.user!, parseBookingId(req), req.body)
    res.json({ success: true, data: booking })
  } catch (error) {
    next(error)
  }
}
