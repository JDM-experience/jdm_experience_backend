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

// Minimal shape both TourWithRelations and a bare `prisma.tour.findUnique()` row satisfy --
// booking.service.ts calls these against a plain Tour row (no includes needed for pricing).
export interface TourPricingFields {
  price: Prisma.Decimal
  limitedOfferEnabled: boolean
  limitedOfferDiscount: Prisma.Decimal | null
  limitedOfferStart: Date | null
  limitedOfferEnd: Date | null
}

/** The single source of truth for "is this tour's discount currently live" -- re-derived from
 *  enabled/start/end on every call (start inclusive, end exclusive), never read from a cached or
 *  client-supplied flag. Used both for the public API's `limitedOffer.isActive` and to gate the
 *  price actually charged at booking time. */
export function isLimitedOfferActive(tour: TourPricingFields): boolean {
  if (!tour.limitedOfferEnabled) return false
  if (tour.limitedOfferDiscount === null || !tour.limitedOfferStart || !tour.limitedOfferEnd) return false
  const now = Date.now()
  return now >= tour.limitedOfferStart.getTime() && now < tour.limitedOfferEnd.getTime()
}

/** The price actually charged -- the tour's regular price whenever no offer is active, otherwise
 *  price discounted by the live offer's percentage. Never stored; always recomputed from `price` +
 *  the discount, so `price` stays the single source of truth (see the Limited-Time Offer spec's
 *  "do not duplicate data" rule). This is what booking.service.ts uses for totalPrice/
 *  unitPriceSnapshot -- the frontend's own copy of the discount is never trusted for that. */
export function getEffectiveTourPrice(tour: TourPricingFields): number {
  const price = Number(tour.price)
  if (!isLimitedOfferActive(tour)) return price
  const discount = Number(tour.limitedOfferDiscount)
  // price * (100 - discount) / 100, rounded to 2 decimal places (cents).
  return Math.round(price * (100 - discount)) / 100
}

function toPublicLimitedOffer(tour: TourPricingFields) {
  return {
    enabled: tour.limitedOfferEnabled,
    discount: tour.limitedOfferDiscount !== null ? Number(tour.limitedOfferDiscount) : null,
    startAt: tour.limitedOfferStart,
    endAt: tour.limitedOfferEnd,
    isActive: isLimitedOfferActive(tour),
  }
}

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
    limitedOffer: toPublicLimitedOffer(tour),
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

interface LimitedOfferInput {
  limitedOfferEnabled?: boolean
  limitedOfferDiscount?: number
  limitedOfferStart?: Date
  limitedOfferEnd?: Date
}

/** Configuring a Limited-Time Offer is staff-only (SUPER_ADMIN/ADMIN) -- a Tour Guide may still
 *  edit their own tour's other details, but never its pricing promotion. Mirrors the existing
 *  status-field restriction just above/below this. */
function assertStaffOnlyLimitedOfferInput(actor: Actor, input: LimitedOfferInput) {
  const touchesOffer =
    input.limitedOfferEnabled !== undefined ||
    input.limitedOfferDiscount !== undefined ||
    input.limitedOfferStart !== undefined ||
    input.limitedOfferEnd !== undefined
  if (actor.role === 'TOUR_GUIDE' && touchesOffer) {
    throw new ApiError(403, 'Tour guides cannot configure Limited-Time Offers.')
  }
}

/** Re-validates the *effective* (merged) offer state, not just whatever subset of fields this
 *  request happened to send -- a partial update that only changes the discount must still be
 *  rejected if the resulting start/end (carried over from the existing row) would be invalid. */
function assertValidLimitedOffer(offer: { enabled: boolean; discount: number | null; start: Date | null; end: Date | null }) {
  if (!offer.enabled) return
  if (offer.discount === null) {
    throw new ApiError(400, 'A discount percentage is required to enable a Limited-Time Offer.')
  }
  if (offer.discount <= 0 || offer.discount > 100) {
    throw new ApiError(400, 'Discount must be greater than 0% and no more than 100%.')
  }
  if (!offer.start || !offer.end) {
    throw new ApiError(400, 'A start and end date/time are required to enable a Limited-Time Offer.')
  }
  if (offer.start.getTime() >= offer.end.getTime()) {
    throw new ApiError(400, 'The Limited-Time Offer start must be before its end.')
  }
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
  } & LimitedOfferInput,
) {
  assertStaffOnlyLimitedOfferInput(actor, input)

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

  const limitedOfferEnabled = input.limitedOfferEnabled ?? false
  const limitedOfferDiscount = input.limitedOfferDiscount ?? null
  const limitedOfferStart = input.limitedOfferStart ?? null
  const limitedOfferEnd = input.limitedOfferEnd ?? null
  assertValidLimitedOffer({ enabled: limitedOfferEnabled, discount: limitedOfferDiscount, start: limitedOfferStart, end: limitedOfferEnd })

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
      limitedOfferEnabled,
      limitedOfferDiscount,
      limitedOfferStart,
      limitedOfferEnd,
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
  } & LimitedOfferInput,
) {
  assertStaffOnlyLimitedOfferInput(actor, input)

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

  // Merge against the existing row -- a request that only changes e.g. the discount must still be
  // validated against whatever start/end is already saved, not just the fields it happened to send.
  const limitedOfferEnabled = input.limitedOfferEnabled ?? existing.limitedOfferEnabled
  const limitedOfferDiscount =
    input.limitedOfferDiscount ?? (existing.limitedOfferDiscount !== null ? Number(existing.limitedOfferDiscount) : null)
  const limitedOfferStart = input.limitedOfferStart ?? existing.limitedOfferStart
  const limitedOfferEnd = input.limitedOfferEnd ?? existing.limitedOfferEnd
  assertValidLimitedOffer({ enabled: limitedOfferEnabled, discount: limitedOfferDiscount, start: limitedOfferStart, end: limitedOfferEnd })

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
      limitedOfferEnabled,
      limitedOfferDiscount,
      limitedOfferStart,
      limitedOfferEnd,
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

/**
 * Contact Settings priority: the tour's own `contactPhone` (this IS the "Tour Guide WhatsApp
 * Number" field surfaced in Contact Settings -- no separate whatsapp column was added, since this
 * one already exists, is per-tour, and already flows into the confirmation email) first, then the
 * assigned Tour Guide's own profile phone, then unavailable. Never a random guide/admin/hardcoded
 * number. Re-run on every read (booking confirmation, customer display, admin preview) rather than
 * stored, so it always reflects the current Contact Settings + guide assignment.
 */
export function resolveTourWhatsapp(tour: { contactPhone: string | null }, guide?: { phone: string | null } | null): string | null {
  return tour.contactPhone?.trim() || guide?.phone?.trim() || null
}

export async function getTourContact(tourId: number) {
  const tour = await prisma.tour.findUnique({ where: { id: tourId }, include: { guide: true } })
  if (!tour || tour.isDeleted) throw new ApiError(404, 'Tour not found.')
  return {
    contactName: tour.contactName,
    contactEmail: tour.contactEmail,
    contactPhone: tour.contactPhone,
    resolvedWhatsapp: resolveTourWhatsapp(tour, tour.guide),
  }
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
    include: { guide: true },
  })
  await recordAuditLog({ userId: actor.userId, role: actor.role, action: 'tour.contact_update', entity: 'tours', entityId: tourId })
  return {
    contactName: updated.contactName,
    contactEmail: updated.contactEmail,
    contactPhone: updated.contactPhone,
    resolvedWhatsapp: resolveTourWhatsapp(updated, updated.guide),
  }
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
