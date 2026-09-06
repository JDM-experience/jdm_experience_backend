import { getForecast } from '../controllers/weather.controller'
import { apiErrorResponseSchema } from '../validators/common.validator'
import { forecastResponseSchema } from '../validators/weather.validator'
import type { RouteDefinition } from './route-definition'

// Public, informational only -- every tour shares the one fixed JDM Experience location
// (app_settings.latitude/longitude), so there is nothing tour-specific or private to gate here.
export const weatherRoutes: RouteDefinition[] = [
  {
    method: 'get',
    path: '/weather',
    handler: getForecast,
    summary: '16-day daily forecast for the fixed JDM Experience location',
    description:
      'Proxies Open-Meteo so the frontend never calls a third-party weather API directly. ' +
      'Cached in-memory for 30 minutes per server instance to avoid re-fetching on every request.',
    responses: {
      200: { description: 'Daily forecast entries.', schema: forecastResponseSchema },
      502: { description: 'Open-Meteo is unavailable or returned an invalid response.', schema: apiErrorResponseSchema },
    },
  },
]
