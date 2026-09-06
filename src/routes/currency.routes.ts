import { convert, listCurrencies } from '../controllers/currency.controller'
import { validateQuery } from '../middleware/validate'
import { apiErrorResponseSchema } from '../validators/common.validator'
import { convertCurrencyQuerySchema, convertResponseSchema, currenciesResponseSchema } from '../validators/currency.validator'
import type { RouteDefinition } from './route-definition'

// Public, informational only -- a converted price is never the authoritative charge amount (that
// always stays in JPY on the Booking/Tour records), so there's nothing here to gate behind auth.
export const currencyRoutes: RouteDefinition[] = [
  {
    method: 'get',
    path: '/currency/currencies',
    handler: listCurrencies,
    summary: 'List supported currency codes',
    responses: {
      200: { description: 'Supported currency codes and names.', schema: currenciesResponseSchema },
      502: { description: 'Currency service is unavailable.', schema: apiErrorResponseSchema },
    },
  },
  {
    method: 'get',
    path: '/currency/convert',
    handler: [validateQuery(convertCurrencyQuerySchema), convert],
    summary: 'Convert an amount between two currencies',
    description:
      'Proxies a currency exchange-rate provider so the frontend never calls it (or holds any ' +
      'provider credentials) directly. Purely informational -- never changes a stored tour price.',
    request: { query: convertCurrencyQuerySchema },
    responses: {
      200: { description: 'Conversion result.', schema: convertResponseSchema },
      400: { description: 'Unsupported currency code.', schema: apiErrorResponseSchema },
      422: { description: 'Validation failed (missing/invalid from, to, or amount).', schema: apiErrorResponseSchema },
      502: { description: 'Currency service is unavailable.', schema: apiErrorResponseSchema },
    },
  },
]
