import { z } from 'zod'

// Tour-level operational state, not per-date bookability (a date's booked/free status is derived
// from Bookings themselves — see bookedDatesResponseSchema below). A tour always starts PENDING
// and can only reach AVAILABLE via POST /tours/:id/confirm — see tour.service.ts.
const statusEnum = z.enum(['PENDING', 'AVAILABLE', 'UNAVAILABLE', 'UNDER_MAINTENANCE'])
const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/

// Whitelisted GET /tours sort fields — never pass a client-supplied string into Prisma's
// `orderBy` directly (see listTours's SORT_FIELD_MAP in tour.service.ts, which maps these to the
// actual Prisma field).
const tourSortByEnum = z.enum(['name', 'price', 'seats', 'createdAt', 'status'])
const sortOrderEnum = z.enum(['asc', 'desc'])

const focalPercentSchema = z.number().min(0).max(100)

export const addTourImageSchema = z.object({
  imageUrl: z.string().trim().min(1).max(500),
  sortOrder: z.number().int().nonnegative().default(0),
  focalX: focalPercentSchema.default(50),
  focalY: focalPercentSchema.default(50),
})

export const updateTourImageSchema = z
  .object({
    focalX: focalPercentSchema.optional(),
    focalY: focalPercentSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update.' })

export const createTourSchema = z.object({
  name: z.string().trim().min(1, 'Tour name is required.').max(150),
  slug: z.string().trim().min(1, 'Slug is required.').max(150).regex(slugPattern, 'Slug must be lowercase, alphanumeric, hyphen-separated.'),
  description: z.string().trim().max(5000).optional(),
  price: z.number().positive('Price must be greater than 0.'),
  currency: z.string().trim().length(3).default('JPY'),
  // No status field here — every new tour starts PENDING regardless of who creates it, and only
  // moves to AVAILABLE via an explicit POST /tours/:id/confirm (see "Automatic Availability After
  // Confirmation" in the Tour Management spec).
  seats: z.number().int().positive('Seats must be a whole number greater than 0.').default(1),
  guideId: z.number().int().positive().nullable().optional(),
  // Optional — attach images (already uploaded via POST /uploads/tour-images) in the same request.
  images: z.array(addTourImageSchema).max(20).optional(),
})

export const updateTourSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    slug: z.string().trim().min(1).max(150).regex(slugPattern, 'Slug must be lowercase, alphanumeric, hyphen-separated.').optional(),
    description: z.string().trim().max(5000).optional(),
    price: z.number().positive().optional(),
    currency: z.string().trim().length(3).optional(),
    status: statusEnum.optional(),
    seats: z.number().int().positive('Seats must be a whole number greater than 0.').optional(),
    guideId: z.number().int().positive().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update.' })

export const tourContactSchema = z
  .object({
    contactName: z.string().trim().min(1).max(150).optional(),
    contactEmail: z.string().trim().toLowerCase().email('Enter a valid email address.').optional(),
    contactPhone: z.string().trim().min(1).max(50).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update.' })

const tourContactResponseDataSchema = z.object({
  contactName: z.string().nullable().meta({ example: 'John Smith' }),
  contactEmail: z.string().nullable().meta({ example: 'john@example.com' }),
  contactPhone: z.string().nullable().meta({ example: '+81-90-1234-5678' }),
})
export const tourContactResponseSchema = z
  .object({ success: z.literal(true), data: tourContactResponseDataSchema })
  .meta({ id: 'TourContactResponse' })

export const tourListQuerySchema = z
  .object({
    status: statusEnum.optional(),
    // Empty string behaves like "not provided" — a cleared search box submits `?search=`.
    search: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => (v ? v : undefined)),
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    sortBy: tourSortByEnum.optional(),
    sortOrder: sortOrderEnum.optional(),
  })
  .refine((data) => data.minPrice === undefined || data.maxPrice === undefined || data.minPrice <= data.maxPrice, {
    message: 'minPrice must not be greater than maxPrice.',
    path: ['minPrice'],
  })
export const tourIdParamSchema = z.object({ id: z.coerce.number().int().positive() })
export const tourChildParamSchema = z.object({ tourId: z.coerce.number().int().positive() })
export const tourImageParamSchema = z.object({
  tourId: z.coerce.number().int().positive(),
  imageId: z.coerce.number().int().positive(),
})

const tourGuideSchema = z
  .object({
    id: z.number().meta({ example: 1 }),
    userId: z.number().meta({ example: 3 }),
    fullName: z.string().nullable().meta({ example: 'Kenji Sato' }),
    email: z.string().nullable().meta({ example: 'kenji@example.com' }),
    phone: z.string().nullable().meta({ example: '+81-90-1234-5678' }),
    bio: z.string().nullable().meta({ example: 'JDM enthusiast and licensed tour guide.' }),
  })
  .meta({ id: 'TourGuide' })

const tourImageSchema = z
  .object({
    id: z.number().meta({ example: 1 }),
    imageUrl: z.string().meta({ example: 'https://example.com/tour.jpg' }),
    sortOrder: z.number().int().meta({ example: 0 }),
    focalX: z.number().meta({ example: 50 }),
    focalY: z.number().meta({ example: 50 }),
  })
  .meta({ id: 'TourImage' })

// Exported for reuse by wishlist.validator.ts, which embeds a full Tour in each wishlist item.
export const tourSchema = z
  .object({
    id: z.number().meta({ example: 1 }),
    name: z.string().meta({ example: 'Mt. Fuji JDM Drive Tour' }),
    slug: z.string().meta({ example: 'mt-fuji-jdm-drive-tour' }),
    description: z.string().nullable().meta({ example: 'A scenic drive tour around Mt. Fuji.' }),
    price: z.number().meta({ example: 25000 }),
    currency: z.string().meta({ example: 'JPY' }),
    status: statusEnum.meta({ example: 'AVAILABLE' }),
    seats: z.number().int().meta({ example: 4 }),
    guide: tourGuideSchema.nullable(),
    images: z.array(tourImageSchema),
    createdAt: z.string().meta({ example: '2026-08-11T10:26:53.912Z' }),
    updatedAt: z.string().meta({ example: '2026-08-11T10:26:53.912Z' }),
  })
  .meta({ id: 'Tour' })

export const tourGuidesListResponseSchema = z
  .object({ success: z.literal(true), data: z.array(tourGuideSchema) })
  .meta({ id: 'TourGuidesListResponse' })

export const tourResponseSchema = z.object({ success: z.literal(true), data: tourSchema }).meta({ id: 'TourResponse' })
export const toursListResponseSchema = z
  .object({ success: z.literal(true), data: z.array(tourSchema) })
  .meta({ id: 'ToursListResponse' })
export const deleteTourResponseSchema = z.object({ success: z.literal(true), data: z.null() }).meta({ id: 'DeleteTourResponse' })

export const tourImageResponseSchema = z
  .object({ success: z.literal(true), data: tourImageSchema })
  .meta({ id: 'TourImageResponse' })
export const deleteTourImageResponseSchema = z
  .object({ success: z.literal(true), data: z.null() })
  .meta({ id: 'DeleteTourImageResponse' })

// Future dates (YYYY-MM-DD) that are currently unavailable (an active booking or someone's
// unexpired hold) for a tour — a date not in this list is bookable (subject to the tour's own
// status and the JST same-day cutoff).
export const bookedDatesResponseSchema = z
  .object({ success: z.literal(true), data: z.array(z.string()).meta({ example: ['2026-09-10', '2026-09-14'] }) })
  .meta({ id: 'BookedDatesResponse' })

export const holdDateSchema = z.object({
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'bookingDate must be in YYYY-MM-DD format.'),
})

const tourDateHoldSchema = z
  .object({
    tourId: z.number().meta({ example: 1 }),
    bookingDate: z.string().meta({ example: '2026-09-10' }),
    expiresAt: z.string().meta({ example: '2026-09-06T10:41:00.000Z' }),
  })
  .meta({ id: 'TourDateHold' })

export const tourDateHoldResponseSchema = z
  .object({ success: z.literal(true), data: tourDateHoldSchema })
  .meta({ id: 'TourDateHoldResponse' })

export const releaseDateResponseSchema = z
  .object({ success: z.literal(true), data: z.null() })
  .meta({ id: 'ReleaseDateResponse' })
