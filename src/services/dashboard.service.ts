import { prisma } from '../config/prisma'

export interface DashboardFilter {
  from?: string
  to?: string
}

/**
 * Revenue counts only paymentStatus=PAID bookings -- under the current status-consistency rules
 * (see booking.service.ts's updateBookingStatus), that only ever happens together with
 * status=CONFIRMED or COMPLETED, so "total" and "confirmed" revenue are the same figure today.
 * Both are still reported separately since that's what the business asked for, and it stops being
 * a tautology the moment revenue can ever be earned another way. Pending/cancelled/rejected
 * bookings never count toward revenue.
 *
 * Aggregation happens here, not in the frontend -- the frontend only ever receives these already-
 * computed totals, never the underlying booking rows.
 */
export async function getDashboardSummary(filter: DashboardFilter) {
  const createdAt =
    filter.from || filter.to
      ? {
          ...(filter.from ? { gte: new Date(`${filter.from}T00:00:00.000Z`) } : {}),
          ...(filter.to ? { lte: new Date(`${filter.to}T23:59:59.999Z`) } : {}),
        }
      : undefined

  const bookings = await prisma.booking.findMany({
    where: createdAt ? { createdAt } : undefined,
    select: {
      tourId: true,
      tourNameSnapshot: true,
      status: true,
      paymentStatus: true,
      participants: true,
      totalPrice: true,
      createdAt: true,
    },
  })

  const sales = { totalBookings: bookings.length, pendingBookings: 0, confirmedBookings: 0, cancelledBookings: 0, completedBookings: 0 }
  let totalRevenue = 0
  let confirmedRevenue = 0
  let pendingRevenue = 0

  const tourMap = new Map<
    number,
    { tourId: number; tourName: string; bookings: number; participants: number; confirmedBookings: number; cancelledBookings: number; revenue: number }
  >()
  const dailyMap = new Map<string, { date: string; bookings: number; revenue: number }>()

  for (const b of bookings) {
    if (b.status === 'PENDING') sales.pendingBookings++
    else if (b.status === 'CONFIRMED') sales.confirmedBookings++
    else if (b.status === 'CANCELLED') sales.cancelledBookings++
    else if (b.status === 'COMPLETED') sales.completedBookings++

    const price = Number(b.totalPrice)
    const isRevenue = b.paymentStatus === 'PAID'
    if (isRevenue) {
      totalRevenue += price
      confirmedRevenue += price
    } else if (b.paymentStatus === 'PENDING') {
      pendingRevenue += price
    }

    let tourEntry = tourMap.get(b.tourId)
    if (!tourEntry) {
      tourEntry = { tourId: b.tourId, tourName: b.tourNameSnapshot, bookings: 0, participants: 0, confirmedBookings: 0, cancelledBookings: 0, revenue: 0 }
      tourMap.set(b.tourId, tourEntry)
    }
    tourEntry.bookings += 1
    tourEntry.participants += b.participants
    if (b.status === 'CONFIRMED' || b.status === 'COMPLETED') tourEntry.confirmedBookings += 1
    if (b.status === 'CANCELLED') tourEntry.cancelledBookings += 1
    if (isRevenue) tourEntry.revenue += price

    const day = b.createdAt.toISOString().slice(0, 10)
    let dayEntry = dailyMap.get(day)
    if (!dayEntry) {
      dayEntry = { date: day, bookings: 0, revenue: 0 }
      dailyMap.set(day, dayEntry)
    }
    dayEntry.bookings += 1
    if (isRevenue) dayEntry.revenue += price
  }

  const tourPerformance = [...tourMap.values()].sort((a, b) => b.revenue - a.revenue)
  const salesTrend = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date))

  return {
    sales,
    revenue: { totalRevenue, confirmedRevenue, pendingRevenue },
    tourPerformance,
    salesTrend,
  }
}
