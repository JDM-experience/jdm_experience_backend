import { z } from 'zod'

const dailyForecastSchema = z
  .object({
    date: z.string().meta({ example: '2026-09-10' }),
    weatherCode: z.number().int().meta({ example: 1 }),
    tempMaxC: z.number().meta({ example: 28.4 }),
    tempMinC: z.number().meta({ example: 21.1 }),
    precipitationProbability: z.number().nullable().meta({ example: 10 }),
    windSpeedMaxKmh: z.number().nullable().meta({ example: 12.3 }),
  })
  .meta({ id: 'DailyForecast' })

export const forecastResponseSchema = z
  .object({ success: z.literal(true), data: z.array(dailyForecastSchema) })
  .meta({ id: 'ForecastResponse' })
