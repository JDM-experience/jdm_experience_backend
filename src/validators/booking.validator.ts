import { z } from 'zod'

const bookingStatusEnum = z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'])
const paymentStatusEnum = z.enum(['UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED'])

// No `bookingTime` field, deliberately — customers select a date only. No `deliveryAddress`
// either — a reservation has no shipping component; contact info below is how the customer and
// tour owner reach each other, not a shipping destination.
//
// Contact info, payment method, and payment proof are all required -- the checkout page is the
// one place a reservation is created, and it collects all of this before the customer can
// confirm (see tour.controller.ts's createBooking, which creates the Booking + PaymentProof
// together in one transaction rather than as two separate calls).
export const createBookingSchema = z.object({
  tourId: z.number().int().positive(),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'bookingDate must be in YYYY-MM-DD format.'),
  participants: z.number().int().positive().default(1),
  specialRequests: z.string().trim().max(2000).optional(),
  customerName: z.string().trim().min(1, 'Full name is required.').max(150),
  customerEmail: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  customerPhone: z.string().trim().min(1, 'Phone number is required.').max(50),
  paymentMethodId: z.number().int().positive(),
  paymentProof: z.object({
    fileUrl: z.string().trim().min(1, 'Payment proof is required.').max(500),
    fileName: z.string().trim().min(1).max(255),
    fileType: z.string().trim().min(1).max(50),
  }),
})

export const updateBookingSchema = z
  .object({ status: bookingStatusEnum.optional(), paymentStatus: paymentStatusEnum.optional() })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update.' })

export const bookingIdParamSchema = z.object({ id: z.coerce.number().int().positive() })

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be in YYYY-MM-DD format.')

// Whitelisted sort fields only -- never build Prisma `orderBy` from a raw client-supplied field
// name (same discipline as tour.validator.ts's sortBy enum).
export const bookingSortByEnum = z.enum(['createdAt', 'bookingDate', 'customerName', 'tourName', 'status', 'paymentStatus', 'totalPrice'])

// Shared by GET /bookings (staff) and GET /bookings/my-bookings (customer) -- the customer route's
// controller always ANDs in the caller's own userId regardless of what's in this query, so a
// customer can never widen these params into someone else's bookings.
export const bookingListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: bookingStatusEnum.optional(),
  paymentStatus: paymentStatusEnum.optional(),
  tourId: z.coerce.number().int().positive().optional(),
  dateFrom: dateOnly.optional(),
  dateTo: dateOnly.optional(),
  sortBy: bookingSortByEnum.optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
})

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
    customerName: z.string().nullable().meta({ example: 'Jane Doe' }),
    customerEmail: z.string().nullable().meta({ example: 'jane@example.com' }),
    customerPhone: z.string().nullable().meta({ example: '+81-90-1234-5678' }),
    paymentMethodId: z.number().nullable().meta({ example: 1 }),
    paymentMethodName: z.string().nullable().meta({ example: 'GCash' }),
    createdAt: z.string().meta({ example: '2026-08-11T10:26:53.912Z' }),
  })
  .meta({ id: 'Booking' })

export const bookingResponseSchema = z.object({ success: z.literal(true), data: bookingSchema }).meta({ id: 'BookingResponse' })
export const bookingsListResponseSchema = z
  .object({ success: z.literal(true), data: z.array(bookingSchema) })
  .meta({ id: 'BookingsListResponse' })
