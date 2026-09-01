/**
 * Ported from jdm_experience_frontend's src/utils/dateTime.ts — the same JST same-day-cutoff
 * rule, now enforced server-side (the frontend's version is UX-only and can be bypassed by a
 * direct API call, so this is the copy that actually gates bookings).
 */

export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const parsed = new Date(`${value}T00:00:00Z`)
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.getUTCFullYear() === y &&
    parsed.getUTCMonth() + 1 === m &&
    parsed.getUTCDate() === d
  )
}

function getJSTNowParts(): { date: string; hourMinute: string } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(new Date())
  const map: Record<string, string> = {}
  for (const part of parts) map[part.type] = part.value
  const hour = (Number(map.hour) % 24).toString().padStart(2, '0')
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    hourMinute: `${hour}:${map.minute}`,
  }
}

/**
 * Same-day bookings close AT `cutoffHour` Japan Standard Time (inclusive — 5:00 PM JST itself
 * is rejected, not just after it) and any date already in the past (JST) is always closed.
 * Future dates are always open. `cutoffHour` comes from `app_settings.booking_cutoff_hour`
 * (defaults to 17 — see settings.service.ts). Server-side, so a client can't bypass this by
 * simply not rendering a disabled calendar cell — every date is re-checked here regardless of
 * what the frontend allowed the user to pick.
 */
export function isBookingClosedForDate(date: string, cutoffHour: number): boolean {
  if (!isValidDateString(date)) return true
  const { date: todayJST, hourMinute } = getJSTNowParts()
  if (date < todayJST) return true
  if (date > todayJST) return false
  return hourMinute >= `${String(cutoffHour).padStart(2, '0')}:00`
}

export function isBookingAllowed(date: string, cutoffHour: number): boolean {
  return isValidDateString(date) && !isBookingClosedForDate(date, cutoffHour)
}
