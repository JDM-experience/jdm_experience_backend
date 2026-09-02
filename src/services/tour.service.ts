import { prisma } from '../config/prisma'
import { ApiError } from '../middleware/errorHandler'
import { recordAuditLog } from './auditLog.service'
import { Prisma, type Role, type TourStatus } from '../generated/prisma/client'

type Actor = { userId: number; role: Role }

const TOUR_INCLUDE = {
  images: { orderBy: { sortOrder: 'asc' as const } },
  guide: { include: { user: true } },
} satisfies Prisma.TourInclude

type TourWithRelations = Prisma.TourGetPayload<{ include: typeof TOUR_INCLUDE }>

function toPublicTour(tour: TourWithRelations) {
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
    images: tour.images.map((img) => ({ id: img.id, imageUrl: img.imageUrl, sortOrder: img.sortOrder })),
    createdAt: tour.createdAt,
    updatedAt: tour.updatedAt,
  }
}

export async function listTours(filter?: { status?: TourStatus }) {
  const tours = await prisma.tour.findMany({
    where: { isDeleted: false, ...(filter?.status ? { status: filter.status } : {}) },
    include: TOUR_INCLUDE,
    orderBy: { id: 'desc' },
  })
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
    images?: { imageUrl: string; sortOrder: number }[]
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
        ? { create: input.images.map((img) => ({ imageUrl: img.imageUrl, sortOrder: img.sortOrder })) }
        : undefined,
    },
    include: TOUR_INCLUDE,
  })

  await recordAuditLog({ userId: actor.userId, action: 'tour.create', entity: 'tours', entityId: tour.id })
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

  await recordAuditLog({ userId: actor.userId, action: 'tour.update', entity: 'tours', entityId: tourId })
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
  await recordAuditLog({ userId: actor.userId, action: 'tour.delete', entity: 'tours', entityId: tourId })
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
  await recordAuditLog({ userId: actor.userId, action: 'tour.confirm', entity: 'tours', entityId: tourId })
  return toPublicTour(updated)
}

export async function addTourImage(tourId: number, input: { imageUrl: string; sortOrder: number }) {
  const tour = await prisma.tour.findUnique({ where: { id: tourId } })
  if (!tour) throw new ApiError(404, 'Tour not found.')

  const image = await prisma.tourImage.create({
    data: { tourId, imageUrl: input.imageUrl, sortOrder: input.sortOrder },
  })
  return { id: image.id, imageUrl: image.imageUrl, sortOrder: image.sortOrder }
}

export async function removeTourImage(tourId: number, imageId: number): Promise<void> {
  const image = await prisma.tourImage.findUnique({ where: { id: imageId } })
  if (!image || image.tourId !== tourId) throw new ApiError(404, 'Tour image not found.')
  await prisma.tourImage.delete({ where: { id: imageId } })
}

/** Which future dates already have a CONFIRMED booking (and so can't be booked again) — powers
 *  the customer-facing date picker's disabled-dates list. See booking.service.ts for the same
 *  invariant enforced authoritatively at booking-create/confirm time. */
export async function listBookedDates(tourId: number): Promise<string[]> {
  const rows = await prisma.booking.findMany({
    where: { tourId, status: 'CONFIRMED', bookingDate: { gte: new Date(new Date().toISOString().slice(0, 10)) } },
    select: { bookingDate: true },
    orderBy: { bookingDate: 'asc' },
  })
  return rows.map((r) => r.bookingDate.toISOString().slice(0, 10))
}
