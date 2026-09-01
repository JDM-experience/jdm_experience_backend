import { prisma } from '../config/prisma'
import { ApiError } from '../middleware/errorHandler'
import { recordAuditLog } from './auditLog.service'
import type { Role, SocialPlatform } from '../generated/prisma/client'

const SETTINGS_ID = 1

type Actor = { userId: number; role: Role }

/** `app_settings` is a single global row — the one JDM Experience location/config (all tours
 *  share this one location; nothing is per-tour). */
export async function getBookingCutoffHour(): Promise<number> {
  const settings = await prisma.appSettings.findUnique({ where: { id: SETTINGS_ID } })
  return settings?.bookingCutoffHour ?? 17
}

export async function getPublicSettings() {
  const s = await prisma.appSettings.findUnique({ where: { id: SETTINGS_ID } })
  if (!s) return null
  return {
    locationName: s.locationName,
    address: s.address,
    latitude: Number(s.latitude),
    longitude: Number(s.longitude),
    timezone: s.timezone,
    contactEmail: s.contactEmail,
    contactPhone: s.contactPhone,
    contactHours: s.contactHours,
    bookingCutoffHour: s.bookingCutoffHour,
  }
}

export async function updateContactSettings(
  actor: Actor,
  input: { contactEmail?: string; contactPhone?: string; address?: string; contactHours?: string },
) {
  // Deliberately does not accept latitude/longitude here — never invent coordinates. A real
  // location update is a separate, explicitly-labeled path once the client provides real values.
  await prisma.appSettings.update({
    where: { id: SETTINGS_ID },
    data: {
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      address: input.address,
      contactHours: input.contactHours,
    },
  })

  await recordAuditLog({
    userId: actor.userId,
    action: 'settings.contact_update',
    entity: 'app_settings',
    entityId: SETTINGS_ID,
  })
  return getPublicSettings()
}

function toPublicSocialLink(row: {
  id: number
  platform: SocialPlatform
  url: string
  enabled: boolean
  displayOrder: number
}) {
  return { id: row.id, platform: row.platform, url: row.url, enabled: row.enabled, displayOrder: row.displayOrder }
}

export async function listSocialLinks() {
  const rows = await prisma.socialMediaLink.findMany({ orderBy: { displayOrder: 'asc' } })
  return rows.map(toPublicSocialLink)
}

export async function createSocialLink(
  actor: Actor,
  input: { platform: SocialPlatform; url: string; enabled: boolean; displayOrder: number },
) {
  const existing = await prisma.socialMediaLink.findUnique({ where: { platform: input.platform } })
  if (existing) throw new ApiError(409, 'This platform is already configured — use PUT to edit it.')

  const row = await prisma.socialMediaLink.create({
    data: { platform: input.platform, url: input.url, enabled: input.enabled, displayOrder: input.displayOrder },
  })

  await recordAuditLog({
    userId: actor.userId,
    action: 'settings.social_link_create',
    entity: 'social_media_links',
    entityId: row.id,
  })
  return toPublicSocialLink(row)
}

export async function updateSocialLink(
  actor: Actor,
  id: number,
  input: { url?: string; enabled?: boolean; displayOrder?: number },
) {
  const existing = await prisma.socialMediaLink.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Social media link not found.')

  const row = await prisma.socialMediaLink.update({
    where: { id },
    data: { url: input.url, enabled: input.enabled, displayOrder: input.displayOrder },
  })

  await recordAuditLog({
    userId: actor.userId,
    action: 'settings.social_link_update',
    entity: 'social_media_links',
    entityId: id,
  })
  return toPublicSocialLink(row)
}

export async function deleteSocialLink(actor: Actor, id: number): Promise<void> {
  const existing = await prisma.socialMediaLink.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Social media link not found.')

  await prisma.socialMediaLink.delete({ where: { id } })
  await recordAuditLog({
    userId: actor.userId,
    action: 'settings.social_link_delete',
    entity: 'social_media_links',
    entityId: id,
  })
}
