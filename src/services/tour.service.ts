import { prisma } from '../config/prisma'
import { ApiError } from '../middleware/errorHandler'
import { recordAuditLog } from './auditLog.service'
import { Prisma, type Role, type TourStatus } from '../generated/prisma/client'

type Actor = { userId: number; role: Role }

// Exported for reuse by wishlist.service.ts, which needs the exact same tour-shaping logic when
// listing a customer's saved tours (via a nested `tour: { include: TOUR_INCLUDE }`) rather than
// duplicating this mapping.
export const TOUR_INCLUDE = {
  images: { orderBy: { sortOrder: 'asc' as const } },
  guide: { include: { user: true } },
} satisfies Prisma.TourInclude

type TourWithRelations = Prisma.TourGetPayload<{ include: typeof TOUR_INCLUDE }>

export function toPublicTour(tour: TourWithRelations) {
  return {
    id: tour.id,
    name: tour.name,
    slug: tour.slug,
    description: tour.description,
    price: Number(tour.price),
    currency: tour.currency,
    status: tour.status,
    seats: tour.seats,
    guide: tour.guide
      ? {
          id: tour.guide.id,
          userId: tour.guide.userId,
          fullName: tour.guide.user.fullName,
          email: tour.guide.user.email,
          phone: tour.guide.phone,
          bio: tour.guide.bio,
        }
      : null,
    images: tour.images.map((img) => ({ id: img.id, imageUrl: img.imageUrl, sortOrder: img.sortOrder, focalX: img.focalX, focalY: img.focalY })),
    createdAt: tour.createdAt,
    updatedAt: tour.updatedAt,
  }
}

// Whitelist mapping only — never build `orderBy` from a raw client-supplied field name (see
// tourSortByEnum in tour.validator.ts, which is what actually constrains req.query.sortBy before
// it ever reaches here).
const SORT_FIELD_MAP = {
  name: 'name',
  price: 'price',
  seats: 'seats',
  createdAt: 'createdAt',
  status: 'status',
} as const satisfies Record<string, keyof Prisma.TourOrderByWithRelationInput>

export type TourSortBy = keyof typeof SORT_FIELD_MAP

export async function listTours(filter?: {
  status?: TourStatus
  search?: string
  minPrice?: number
  maxPrice?: number
  sortBy?: TourSortBy
  sortOrder?: 'asc' | 'desc'
}) {
  const where: Prisma.TourWhereInput = { isDeleted: false }
  if (filter?.status) where.status = filter.status
  if (filter?.search) {
    // `mode: 'insensitive'` is Postgres-specific (this project's only supported provider — see
    // schema.prisma) — case-insensitive search across name and description.
    where.OR = [
      { name: { contains: filter.search, mode: 'insensitive' } },
      { description: { contains: filter.search, mode: 'insensitive' } },
    ]
  }
  if (filter?.minPrice !== undefined || filter?.maxPrice !== undefined) {
    where.price = {
      ...(filter.minPrice !== undefined ? { gte: filter.minPrice } : {}),
      ...(filter.maxPrice !== undefined ? { lte: filter.maxPrice } : {}),
    }
  }

  // Unchanged default (id desc) when no sort is requested, so callers that don't ask for a
  // specific order (e.g. the admin Tours table) see exactly the same ordering as before.
  const orderBy: Prisma.TourOrderByWithRelationInput = filter?.sortBy
    ? { [SORT_FIELD_MAP[filter.sortBy]]: filter.sortOrder ?? 'asc' }
    : { id: 'desc' }

  const tours = await prisma.tour.findMany({ where, include: TOUR_INCLUDE, orderBy })
  return tours.map(toPublicTour)
}

export async function listMyTours(guideUserId: number) {
  const tours = await prisma.tour.findMany({
    where: { isDeleted: false, guide: { userId: guideUserId } },
    include: TOUR_INCLUDE,
    orderBy: { id: 'desc' },
  })
  return tours.map(toPublicTour)
}

export async function getTour(id: number) {
  const tour = await prisma.tour.findUnique({ where: { id }, include: TOUR_INCLUDE })
  if (!tour || tour.isDeleted) throw new ApiError(404, 'Tour not found.')
  return toPublicTour(tour)
}

async function guideIdForUser(userId: number): Promise<number | null> {
  const guide = await prisma.tourGuide.findUnique({ where: { userId } })
  return guide?.id ?? null
}

/** For the Tour Guide assignment selector on Create/Edit Tour (staff-only). */
export async function listTourGuides() {
  const guides = await prisma.tourGuide.findMany({
    where: { active: true },
    include: { user: true },
    orderBy: { id: 'asc' },
  })
  return guides.map((g) => ({
    id: g.id,
    userId: g.userId,
    fullName: g.user.fullName,
    email: g.user.email,
    phone: g.phone,
    bio: g.bio,
  }))
}

export async function createTour(
  actor: Actor,
  input: {
    name: string
    slug: string
    description?: string
    price: number
    currency: string
    seats: number
    guideId?: number | null
    images?: { imageUrl: string; sortOrder: number; focalX?: number; focalY?: number }[]
  },
) {
  // A Tour Guide is always auto-assigned as the owner of a tour they create — never trust a
  // client-supplied guideId for their own request, and never let them create on someone else's
  // behalf. Staff (Super Admin/Admin) keep full control over guideId, including leaving it unset.
  let guideId = input.guideId ?? null
  if (actor.role === 'TOUR_GUIDE') {
    guideId = await guideIdForUser(actor.userId)
    if (guideId === null) {
      throw new ApiError(400, 'Your tour guide profile is not set up yet. Contact an admin.')
    }
  }

  const tour = await prisma.tour.create({
    data: {
      name: input.name,
      slug: input.slug,
      description: input.description,
      price: input.price,
      currency: input.currency,
      // Always PENDING on create, regardless of who creates it — an admin must explicitly confirm
      // it (POST /tours/:id/confirm) before it becomes bookable.
      status: 'PENDING',
      seats: input.seats,
      guideId,
      images: input.images?.length
        ? {
            create: input.images.map((img) => ({
              imageUrl: img.imageUrl,
              sortOrder: img.sortOrder,
              focalX: img.focalX ?? 50,
              focalY: img.focalY ?? 50,
            })),
          }
        : undefined,
    },
    include: TOUR_INCLUDE,
  })

  await recordAuditLog({ userId: actor.userId, role: actor.role, action: 'tour.create', entity: 'tours', entityId: tour.id })
  return toPublicTour(tour)
}

export async function updateTour(
  actor: Actor,
  tourId: number,
  input: {
    name?: string
    slug?: string
    description?: string
    price?: number
    currency?: string
    status?: TourStatus
    seats?: number
    guideId?: number | null
  },
) {
  // A guide may edit their own tour's details, but may not hand it off to someone else, and may
  // not change its availability status — that's a staff-only action (see confirmTour below and
  // the "Manual Availability Management" rules).
  if (actor.role === 'TOUR_GUIDE') {
    if (input.status !== undefined) {
      throw new ApiError(403, 'Tour guides cannot change a tour\'s availability status.')
    }
    if (input.guideId !== undefined) {
      const ownGuideId = await guideIdForUser(actor.userId)
      const tour = await prisma.tour.findUnique({ where: { id: tourId } })
      if (tour?.guideId !== ownGuideId || input.guideId !== ownGuideId) {
        throw new ApiError(403, 'Tour guides cannot reassign a tour to a different guide.')
      }
    }
  }

  const existing = await prisma.tour.findUnique({ where: { id: tourId } })
  if (!existing || existing.isDeleted) throw new ApiError(404, 'Tour not found.')

  const tour = await prisma.tour.update({
    where: { id: tourId },
    data: {
      name: input.name,
      slug: input.slug,
      description: input.description,
      price: input.price,
      currency: input.currency,
      status: input.status,
      seats: input.seats,
      guideId: input.guideId,
    },
    include: TOUR_INCLUDE,
  })

  await recordAuditLog({ userId: actor.userId, role: actor.role, action: 'tour.update', entity: 'tours', entityId: tourId })
  return toPublicTour(tour)
}

/**
 * Soft-delete — flips `isDeleted`/`deletedAt` rather than removing the row or its relations,
 * since historical Bookings/Payments still reference this tour. `status` is left untouched: it's
 * a separate axis (see the Tour model), so a deleted tour's last known operational state isn't
 * lost if it's ever restored.
 */
export async function deleteTour(actor: Actor, tourId: number): Promise<void> {
  const tour = await prisma.tour.findUnique({ where: { id: tourId } })
  if (!tour || tour.isDeleted) throw new ApiError(404, 'Tour not found.')

  await prisma.tour.update({ where: { id: tourId }, data: { isDeleted: true, deletedAt: new Date() } })
  await recordAuditLog({ userId: actor.userId, role: actor.role, action: 'tour.delete', entity: 'tours', entityId: tourId })
}

/** Staff-only: moves a PENDING tour to AVAILABLE. The one place `status` transitions automatically
 *  rather than via a direct staff edit — see "Automatic Availability After Confirmation". */
export async function confirmTour(actor: Actor, tourId: number) {
  const tour = await prisma.tour.findUnique({ where: { id: tourId } })
  if (!tour || tour.isDeleted) throw new ApiError(404, 'Tour not found.')
  if (tour.status !== 'PENDING') {
    throw new ApiError(400, `Only a PENDING tour can be confirmed (this tour is ${tour.status}).`)
  }

  const updated = await prisma.tour.update({
    where: { id: tourId },
    data: { status: 'AVAILABLE' },
    include: TOUR_INCLUDE,
  })
  await recordAuditLog({ userId: actor.userId, role: actor.role, action: 'tour.confirm', entity: 'tours', entityId: tourId })
  return toPublicTour(updated)
}

export async function addTourImage(
  actor: Actor,
  tourId: number,
  input: { imageUrl: string; sortOrder: number; focalX?: number; focalY?: number },
) {
  const tour = await prisma.tour.findUnique({ where: { id: tourId } })
  if (!tour) throw new ApiError(404, 'Tour not found.')

  const image = await prisma.tourImage.create({
    data: {
      tourId,
      imageUrl: input.imageUrl,
      sortOrder: input.sortOrder,
      focalX: input.focalX ?? 50,
      focalY: input.focalY ?? 50,
    },
  })
  await recordAuditLog({ userId: actor.userId, role: actor.role, action: 'tour.image_update', entity: 'tours', entityId: tourId })
  return { id: image.id, imageUrl: image.imageUrl, sortOrder: image.sortOrder, focalX: image.focalX, focalY: image.focalY }
}

export async function removeTourImage(actor: Actor, tourId: number, imageId: number): Promise<void> {
  const image = await prisma.tourImage.findUnique({ where: { id: imageId } })
  if (!image || image.tourId !== tourId) throw new ApiError(404, 'Tour image not found.')
  await prisma.tourImage.delete({ where: { id: imageId } })
  await recordAuditLog({ userId: actor.userId, role: actor.role, action: 'tour.image_update', entity: 'tours', entityId: tourId })
}

// Sets an image's focal point (0-100% of width/height), applied wherever this image is rendered
// with `object-fit: cover` via CSS `object-position` -- lets an admin keep the subject centered
// even though crop ratios differ per placement (grid card vs. hero vs. detail page).
export async function updateTourImage(
  actor: Actor,
  tourId: number,
  imageId: number,
  input: { focalX?: number; focalY?: number },
) {
  const image = await prisma.tourImage.findUnique({ where: { id: imageId } })
  if (!image || image.tourId !== tourId) throw new ApiError(404, 'Tour image not found.')

  const updated = await prisma.tourImage.update({
    where: { id: imageId },
    data: {
      focalX: input.focalX ?? image.focalX,
      focalY: input.focalY ?? image.focalY,
    },
  })
  await recordAuditLog({ userId: actor.userId, role: actor.role, action: 'tour.image_update', entity: 'tours', entityId: tourId })
  return { id: updated.id, imageUrl: updated.imageUrl, sortOrder: updated.sortOrder, focalX: updated.focalX, focalY: updated.focalY }
}

// Ownership (SUPER_ADMIN/ADMIN: any tour; TOUR_GUIDE: only their own) is already enforced by the
// verifyTourAssignment middleware on these routes (tours.routes.ts) before either function below
// ever runs -- no need to re-check it here.

export async function getTourContact(tourId: number) {
  const tour = await prisma.tour.findUnique({ where: { id: tourId } })
  if (!tour || tour.isDeleted) throw new ApiError(404, 'Tour not found.')
  return { contactName: tour.contactName, contactEmail: tour.contactEmail, contactPhone: tour.contactPhone }
}

export async function updateTourContact(
  actor: Actor,
  tourId: number,
  input: { contactName?: string; contactEmail?: string; contactPhone?: string },
) {
  const tour = await prisma.tour.findUnique({ where: { id: tourId } })
  if (!tour || tour.isDeleted) throw new ApiError(404, 'Tour not found.')

  const updated = await prisma.tour.update({
    where: { id: tourId },
    data: {
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
    },
  })
  await recordAuditLog({ userId: actor.userId, role: actor.role, action: 'tour.contact_update', entity: 'tours', entityId: tourId })
  return { contactName: updated.contactName, contactEmail: updated.contactEmail, contactPhone: updated.contactPhone }
}

/** Which future dates are currently unavailable -- either an active (PENDING or CONFIRMED)
 *  booking already exists, or someone currently holds it (see tourDateHold.service.ts). Powers
 *  the customer-facing date picker's disabled-dates list only; the actual enforcement is
 *  holdDate's own unique-constraint-backed atomic check and createBooking's re-verification, both
 *  in booking.service.ts/tourDateHold.service.ts -- same "non-fatal, worst case the backend
 *  rejects it" discipline as everywhere else this list is fetched. */
export async function listBookedDates(tourId: number): Promise<string[]> {
  const today = new Date(new Date().toISOString().slice(0, 10))
  const [bookings, holds] = await Promise.all([
    prisma.booking.findMany({
      where: { tourId, status: { in: ['PENDING', 'CONFIRMED'] }, bookingDate: { gte: today } },
      select: { bookingDate: true },
    }),
    prisma.tourDateHold.findMany({
      where: { tourId, bookingDate: { gte: today }, expiresAt: { gt: new Date() } },
      select: { bookingDate: true },
    }),
  ])
  const dates = new Set([...bookings, ...holds].map((r) => r.bookingDate.toISOString().slice(0, 10)))
  return [...dates].sort()
}
