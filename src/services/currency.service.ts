import { ApiError } from '../middleware/errorHandler'

const FRANKFURTER_BASE = 'https://api.frankfurter.dev/v1'

// Currencies list changes essentially never -- cache it for a day. Exchange rates move slowly
// enough that a short cache meaningfully cuts duplicate calls (e.g. a customer toggling the
// currency selector back and forth) without ever serving a meaningfully stale rate.
const CURRENCIES_TTL_MS = 24 * 60 * 60 * 1000
const RATE_TTL_MS = 10 * 60 * 1000

let currenciesCache: { expiresAt: number; data: Record<string, string> } | null = null
const rateCache = new Map<string, { expiresAt: number; rate: number; date: string }>()

async function fetchJson<T>(url: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(8000) })
  } catch {
    throw new ApiError(502, 'Currency service is currently unavailable.')
  }
  if (!response.ok) {
    throw new ApiError(502, 'Currency service is currently unavailable.')
  }
  try {
    return (await response.json()) as T
  } catch {
    throw new ApiError(502, 'Currency service returned an invalid response.')
  }
}

export async function getSupportedCurrencies(): Promise<Record<string, string>> {
  if (currenciesCache && currenciesCache.expiresAt > Date.now()) return currenciesCache.data
  const data = await fetchJson<Record<string, string>>(`${FRANKFURTER_BASE}/currencies`)
  currenciesCache = { expiresAt: Date.now() + CURRENCIES_TTL_MS, data }
  return data
}

async function getRate(from: string, to: string): Promise<{ rate: number; date: string }> {
  const key = `${from}_${to}`
  const cached = rateCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached

  const url = new URL(`${FRANKFURTER_BASE}/latest`)
  url.searchParams.set('from', from)
  url.searchParams.set('to', to)
  const body = await fetchJson<{ date: string; rates: Record<string, number> }>(url.toString())

  const rate = body.rates[to]
  if (rate === undefined) {
    throw new ApiError(400, `No exchange rate is available for ${to}.`)
  }
  const entry = { expiresAt: Date.now() + RATE_TTL_MS, rate, date: body.date }
  rateCache.set(key, entry)
  return entry
}

export async function convert(input: { from: string; to: string; amount: number }) {
  const { from, to, amount } = input

  if (from === to) {
    return { amount, from, to, convertedAmount: amount, rate: 1, date: new Date().toISOString().slice(0, 10) }
  }

  const supported = await getSupportedCurrencies()
  const known = new Set([...Object.keys(supported), 'JPY']) // Frankfurter's own base isn't listed as a target of itself in all cases
  if (!known.has(from)) throw new ApiError(400, `"${from}" is not a supported currency.`)
  if (!known.has(to)) throw new ApiError(400, `"${to}" is not a supported currency.`)

  const { rate, date } = await getRate(from, to)
  const convertedAmount = Math.round(amount * rate * 100) / 100
  return { amount, from, to, convertedAmount, rate, date }
}
