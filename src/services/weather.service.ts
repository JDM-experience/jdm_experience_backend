import { prisma } from '../config/prisma'
import { ApiError } from '../middleware/errorHandler'

/** Fallback coordinates (central Tokyo) used only if app_settings has never been configured. */
const DEFAULT_COORDINATES = { latitude: 35.6762, longitude: 139.6503 }

export interface DailyForecast {
  date: string
  weatherCode: number
  tempMaxC: number
  tempMinC: number
  precipitationProbability: number | null
  windSpeedMaxKmh: number | null
}

interface OpenMeteoResponse {
  daily?: {
    time: string[]
    weathercode: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_probability_max?: number[]
    windspeed_10m_max?: number[]
  }
}

// All tours share one fixed physical location (see app_settings.latitude/longitude) -- there is
// no per-tour coordinate anywhere in the schema, so the forecast is the same for every tour and
// can be cached as a single entry. A cold serverless instance starts with an empty cache (this
// is a best-effort in-memory cache, not a durable one), but a warm instance reuses it for 30
// minutes instead of re-querying Open-Meteo on every request.
const CACHE_TTL_MS = 30 * 60 * 1000
let cache: { expiresAt: number; data: DailyForecast[] } | null = null

async function getLocation(): Promise<{ latitude: number; longitude: number }> {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } })
  if (!settings) return DEFAULT_COORDINATES
  return { latitude: Number(settings.latitude), longitude: Number(settings.longitude) }
}

async function fetchForecast(): Promise<DailyForecast[]> {
  const { latitude, longitude } = await getLocation()

  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(latitude))
  url.searchParams.set('longitude', String(longitude))
  url.searchParams.set('daily', 'weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max')
  url.searchParams.set('timezone', 'Asia/Tokyo')
  url.searchParams.set('forecast_days', '16')

  let response: Response
  try {
    response = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) })
  } catch {
    throw new ApiError(502, 'Weather service is currently unavailable.')
  }
  if (!response.ok) {
    throw new ApiError(502, 'Weather service is currently unavailable.')
  }

  let body: OpenMeteoResponse
  try {
    body = (await response.json()) as OpenMeteoResponse
  } catch {
    throw new ApiError(502, 'Weather service returned an invalid response.')
  }

  const daily = body.daily
  if (!daily) return []

  return daily.time.map((date, i) => ({
    date,
    weatherCode: daily.weathercode[i],
    tempMaxC: daily.temperature_2m_max[i],
    tempMinC: daily.temperature_2m_min[i],
    precipitationProbability: daily.precipitation_probability_max?.[i] ?? null,
    windSpeedMaxKmh: daily.windspeed_10m_max?.[i] ?? null,
  }))
}

export async function getForecast(): Promise<DailyForecast[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.data
  const data = await fetchForecast()
  cache = { expiresAt: Date.now() + CACHE_TTL_MS, data }
  return data
}
