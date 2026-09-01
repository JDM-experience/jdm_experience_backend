import { z } from 'zod'

const statusEnum = z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'])
const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/

export const addTourImageSchema = z.object({
  imageUrl: z.string().trim().min(1).max(500),
  sortOrder: z.number().int().nonnegative().default(0),
})

export const createTourSchema = z.object({
  name: z.string().trim().min(1, 'Tour name is required.').max(150),
  slug: z.string().trim().min(1, 'Slug is required.').max(150).regex(slugPattern, 'Slug must be lowercase, alphanumeric, hyphen-separated.'),
  description: z.string().trim().max(5000).optional(),
  price: z.number().positive('Price must be greater than 0.'),
  currency: z.string().trim().length(3).default('JPY'),
  status: statusEnum.default('ACTIVE'),
  capacity: z.number().int().positive().default(1),
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
    capacity: z.number().int().positive().optional(),
    guideId: z.number().int().positive().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update.' })

export const createAvailabilitySchema = z.object({
  startDatetime: z.iso.datetime({ offset: true }),
  spotsRemaining: z.number().int().nonnegative(),
})

export const updateAvailabilitySchema = z
  .object({
    startDatetime: z.iso.datetime({ offset: true }).optional(),
    spotsRemaining: z.number().int().nonnegative().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update.' })

export const tourListQuerySchema = z.object({ status: statusEnum.optional() })
export const tourIdParamSchema = z.object({ id: z.coerce.number().int().positive() })
export const tourImageParamSchema = z.object({
  tourId: z.coerce.number().int().positive(),
  imageId: z.coerce.number().int().positive(),
})
export const tourAvailabilityParamSchema = z.object({ tourId: z.coerce.number().int().positive() })
export const tourAvailabilityItemParamSchema = z.object({
  tourId: z.coerce.number().int().positive(),
  availabilityId: z.coerce.number().int().positive(),
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
  })
  .meta({ id: 'TourImage' })

const tourAvailabilitySchema = z
  .object({
    id: z.number().meta({ example: 1 }),
    startDatetime: z.string().meta({ example: '2026-09-01T09:00:00+09:00' }),
    spotsRemaining: z.number().int().meta({ example: 4 }),
  })
  .meta({ id: 'TourAvailability' })

const tourSchema = z
  .object({
    id: z.number().meta({ example: 1 }),
    name: z.string().meta({ example: 'Mt. Fuji JDM Drive Tour' }),
    slug: z.string().meta({ example: 'mt-fuji-jdm-drive-tour' }),
    description: z.string().nullable().meta({ example: 'A scenic drive tour around Mt. Fuji.' }),
    price: z.number().meta({ example: 25000 }),
    currency: z.string().meta({ example: 'JPY' }),
    status: statusEnum.meta({ example: 'ACTIVE' }),
    capacity: z.number().int().meta({ example: 4 }),
    guide: tourGuideSchema.nullable(),
    images: z.array(tourImageSchema),
    availability: z.array(tourAvailabilitySchema),
    createdAt: z.string().meta({ example: '2026-08-11T10:26:53.912Z' }),
    updatedAt: z.string().meta({ example: '2026-08-11T10:26:53.912Z' }),
  })
  .meta({ id: 'Tour' })

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

export const tourAvailabilityResponseSchema = z
  .object({ success: z.literal(true), data: tourAvailabilitySchema })
  .meta({ id: 'TourAvailabilityResponse' })
export const tourAvailabilityListResponseSchema = z
  .object({ success: z.literal(true), data: z.array(tourAvailabilitySchema) })
  .meta({ id: 'TourAvailabilityListResponse' })
export const deleteTourAvailabilityResponseSchema = z
  .object({ success: z.literal(true), data: z.null() })
  .meta({ id: 'DeleteTourAvailabilityResponse' })
