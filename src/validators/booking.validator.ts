import { z } from 'zod'

const bookingStatusEnum = z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'])
const paymentStatusEnum = z.enum(['UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED'])

// No `bookingTime` field, deliberately — customers select a date only.
export const createBookingSchema = z.object({
  tourId: z.number().int().positive(),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'bookingDate must be in YYYY-MM-DD format.'),
  participants: z.number().int().positive().default(1),
  specialRequests: z.string().trim().max(2000).optional(),
})

export const updateBookingSchema = z
  .object({ status: bookingStatusEnum.optional(), paymentStatus: paymentStatusEnum.optional() })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update.' })

export const bookingIdParamSchema = z.object({ id: z.coerce.number().int().positive() })

const bookingSchema = z
  .object({
    id: z.number().meta({ example: 1 }),
    userId: z.number().meta({ example: 3 }),
    tourId: z.number().meta({ example: 1 }),
    bookingDate: z.string().meta({ example: '2026-09-01T00:00:00.000Z' }),
    participants: z.number().int().meta({ example: 2 }),
    status: bookingStatusEnum.meta({ example: 'PENDING' }),
    totalPrice: z.number().meta({ example: 50000 }),
    depositPaid: z.number().nullable().meta({ example: 0 }),
    paymentStatus: paymentStatusEnum.meta({ example: 'UNPAID' }),
    tourNameSnapshot: z.string().meta({ example: 'Mt. Fuji JDM Drive Tour' }),
    unitPriceSnapshot: z.number().meta({ example: 25000 }),
    currency: z.string().meta({ example: 'JPY' }),
    specialRequests: z.string().nullable().meta({ example: null }),
    createdAt: z.string().meta({ example: '2026-08-11T10:26:53.912Z' }),
  })
  .meta({ id: 'Booking' })

export const bookingResponseSchema = z.object({ success: z.literal(true), data: bookingSchema }).meta({ id: 'BookingResponse' })
export const bookingsListResponseSchema = z
  .object({ success: z.literal(true), data: z.array(bookingSchema) })
  .meta({ id: 'BookingsListResponse' })
