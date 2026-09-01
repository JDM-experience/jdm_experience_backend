import { prisma } from '../config/prisma'
import { ApiError } from '../middleware/errorHandler'
import { recordAuditLog } from './auditLog.service'
import { Prisma, type Role, type TourStatus } from '../generated/prisma/client'

type Actor = { userId: number; role: Role }

const TOUR_INCLUDE = {
  images: { orderBy: { sortOrder: 'asc' as const } },
  availability: { orderBy: { startDatetime: 'asc' as const } },
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
    capacity: tour.capacity,
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
    availability: tour.availability.map((a) => ({
      id: a.id,
      startDatetime: a.startDatetime,
      spotsRemaining: a.spotsRemaining,
    })),
    createdAt: tour.createdAt,
    updatedAt: tour.updatedAt,
  }
}

export async function listTours(filter?: { status?: TourStatus }) {
  const tours = await prisma.tour.findMany({
    where: filter?.status ? { status: filter.status } : undefined,
    include: TOUR_INCLUDE,
    orderBy: { id: 'desc' },
  })
  return tours.map(toPublicTour)
}

export async function listMyTours(guideUserId: number) {
  const tours = await prisma.tour.findMany({
    where: { guide: { userId: guideUserId } },
    include: TOUR_INCLUDE,
    orderBy: { id: 'desc' },
  })
  return tours.map(toPublicTour)
}

export async function getTour(id: number) {
  const tour = await prisma.tour.findUnique({ where: { id }, include: TOUR_INCLUDE })
  if (!tour) throw new ApiError(404, 'Tour not found.')
  return toPublicTour(tour)
}

async function guideIdForUser(userId: number): Promise<number | null> {
  const guide = await prisma.tourGuide.findUnique({ where: { userId } })
  return guide?.id ?? null
}

export async function createTour(
  actor: Actor,
  input: {
    name: string
    slug: string
    description?: string
    price: number
    currency: string
    status: TourStatus
    capacity: number
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
      status: input.status,
      capacity: input.capacity,
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
    capacity?: number
    guideId?: number | null
  },
) {
  // A guide may edit their own tour's details, but may not hand it off to someone else.
  if (actor.role === 'TOUR_GUIDE' && input.guideId !== undefined) {
    const ownGuideId = await guideIdForUser(actor.userId)
    const tour = await prisma.tour.findUnique({ where: { id: tourId } })
    if (tour?.guideId !== ownGuideId || input.guideId !== ownGuideId) {
      throw new ApiError(403, 'Tour guides cannot reassign a tour to a different guide.')
    }
  }

  const tour = await prisma.tour.update({
    where: { id: tourId },
    data: {
      name: input.name,
      slug: input.slug,
      description: input.description,
      price: input.price,
      currency: input.currency,
      status: input.status,
      capacity: input.capacity,
      guideId: input.guideId,
    },
    include: TOUR_INCLUDE,
  })

  await recordAuditLog({ userId: actor.userId, action: 'tour.update', entity: 'tours', entityId: tourId })
  return toPublicTour(tour)
}

/** Soft-delete — archives rather than removing, since historical bookings reference this tour. */
export async function archiveTour(actor: Actor, tourId: number): Promise<void> {
  const tour = await prisma.tour.findUnique({ where: { id: tourId } })
  if (!tour) throw new ApiError(404, 'Tour not found.')

  await prisma.tour.update({ where: { id: tourId }, data: { status: 'ARCHIVED' } })
  await recordAuditLog({ userId: actor.userId, action: 'tour.archive', entity: 'tours', entityId: tourId })
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

export async function listAvailability(tourId: number) {
  const rows = await prisma.tourAvailability.findMany({ where: { tourId }, orderBy: { startDatetime: 'asc' } })
  return rows.map((a) => ({ id: a.id, startDatetime: a.startDatetime, spotsRemaining: a.spotsRemaining }))
}

export async function createAvailability(tourId: number, input: { startDatetime: string; spotsRemaining: number }) {
  const tour = await prisma.tour.findUnique({ where: { id: tourId } })
  if (!tour) throw new ApiError(404, 'Tour not found.')

  const row = await prisma.tourAvailability.create({
    data: { tourId, startDatetime: new Date(input.startDatetime), spotsRemaining: input.spotsRemaining },
  })
  return { id: row.id, startDatetime: row.startDatetime, spotsRemaining: row.spotsRemaining }
}

export async function updateAvailability(
  tourId: number,
  availabilityId: number,
  input: { startDatetime?: string; spotsRemaining?: number },
) {
  const existing = await prisma.tourAvailability.findUnique({ where: { id: availabilityId } })
  if (!existing || existing.tourId !== tourId) throw new ApiError(404, 'Availability slot not found.')

  const row = await prisma.tourAvailability.update({
    where: { id: availabilityId },
    data: {
      startDatetime: input.startDatetime ? new Date(input.startDatetime) : undefined,
      spotsRemaining: input.spotsRemaining,
    },
  })
  return { id: row.id, startDatetime: row.startDatetime, spotsRemaining: row.spotsRemaining }
}

export async function removeAvailability(tourId: number, availabilityId: number): Promise<void> {
  const existing = await prisma.tourAvailability.findUnique({ where: { id: availabilityId } })
  if (!existing || existing.tourId !== tourId) throw new ApiError(404, 'Availability slot not found.')
  await prisma.tourAvailability.delete({ where: { id: availabilityId } })
}
