import { z } from 'zod'

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be in YYYY-MM-DD format.')

export const dashboardSummaryQuerySchema = z.object({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
})

const salesSchema = z.object({
  totalBookings: z.number().int(),
  pendingBookings: z.number().int(),
  confirmedBookings: z.number().int(),
  cancelledBookings: z.number().int(),
  completedBookings: z.number().int(),
})

const revenueSchema = z.object({
  totalRevenue: z.number().meta({ example: 125000 }),
  confirmedRevenue: z.number().meta({ example: 125000 }),
  pendingRevenue: z.number().meta({ example: 5600 }),
})

const tourPerformanceSchema = z.object({
  tourId: z.number(),
  tourName: z.string(),
  bookings: z.number().int(),
  participants: z.number().int(),
  confirmedBookings: z.number().int(),
  cancelledBookings: z.number().int(),
  revenue: z.number(),
})

const salesTrendPointSchema = z.object({
  date: z.string().meta({ example: '2026-09-01' }),
  bookings: z.number().int(),
  revenue: z.number(),
})

const dashboardSummarySchema = z
  .object({
    sales: salesSchema,
    revenue: revenueSchema,
    tourPerformance: z.array(tourPerformanceSchema),
    salesTrend: z.array(salesTrendPointSchema),
  })
  .meta({ id: 'DashboardSummary' })

export const dashboardSummaryResponseSchema = z
  .object({ success: z.literal(true), data: dashboardSummarySchema })
  .meta({ id: 'DashboardSummaryResponse' })
