import { z } from 'zod'

export const convertCurrencyQuerySchema = z.object({
  from: z.string().trim().toUpperCase().length(3, 'Currency code must be 3 letters.'),
  to: z.string().trim().toUpperCase().length(3, 'Currency code must be 3 letters.'),
  amount: z.coerce.number().positive('Amount must be greater than 0.'),
})

const convertResponseDataSchema = z
  .object({
    amount: z.number().meta({ example: 50000 }),
    from: z.string().meta({ example: 'JPY' }),
    to: z.string().meta({ example: 'USD' }),
    convertedAmount: z.number().meta({ example: 337.5 }),
    rate: z.number().meta({ example: 0.00675 }),
    date: z.string().meta({ example: '2026-09-06' }),
  })
  .meta({ id: 'CurrencyConversion' })

export const convertResponseSchema = z
  .object({ success: z.literal(true), data: convertResponseDataSchema })
  .meta({ id: 'CurrencyConversionResponse' })

export const currenciesResponseSchema = z
  .object({ success: z.literal(true), data: z.record(z.string(), z.string()) })
  .meta({ id: 'SupportedCurrenciesResponse' })
