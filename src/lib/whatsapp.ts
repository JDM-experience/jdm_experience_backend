/**
 * wa.me needs a bare international-format digit string -- no leading +, spaces, dashes, or
 * parentheses (e.g. "+81 90-1234 5678" -> "819012345678"). Numbers are stored with whatever
 * formatting an admin/guide typed (see Tour.contactPhone / TourGuide.phone), so this is applied
 * only at link-generation time, never to the stored value itself.
 */
export function toWaMeDigits(rawNumber: string): string {
  return rawNumber.replace(/[^\d+]/g, '').replace(/^\+/, '')
}

export function buildWaMeLink(rawNumber: string): string {
  return `https://wa.me/${toWaMeDigits(rawNumber)}`
}
