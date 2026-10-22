import { createHash } from 'node:crypto'
import { prisma } from '../config/prisma'
import { ApiError } from '../middleware/errorHandler'
import { recordAuditLog } from './auditLog.service'
import { Prisma, type PolicyType, type Role, type SocialPlatform } from '../generated/prisma/client'

const SETTINGS_ID = 1
const ABOUT_ID = 1

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
    role: actor.role,
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
    role: actor.role,
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
    role: actor.role,
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
    role: actor.role,
    action: 'settings.social_link_delete',
    entity: 'social_media_links',
    entityId: id,
  })
}

/** Single global row (id=1), same singleton pattern as app_settings -- the public About Us
 *  page's title/body, editable from Website Settings instead of hardcoded in React. */
export async function getAboutContent() {
  const row = await prisma.aboutContent.findUnique({ where: { id: ABOUT_ID } })
  if (!row) return null
  return { title: row.title, content: row.content }
}

export async function updateAboutContent(actor: Actor, input: { title?: string; content?: string }) {
  const row = await prisma.aboutContent.upsert({
    where: { id: ABOUT_ID },
    create: { id: ABOUT_ID, title: input.title ?? 'About Us', content: input.content ?? '' },
    update: { title: input.title, content: input.content },
  })

  await recordAuditLog({
    userId: actor.userId,
    role: actor.role,
    action: 'settings.about_update',
    entity: 'about_content',
    entityId: ABOUT_ID,
  })
  return { title: row.title, content: row.content }
}

function policyContentHash(title: string, content: string): string {
  return createHash('sha256').update(JSON.stringify([title, content]), 'utf8').digest('hex')
}

function toPublicPolicyPage(
  row: { type: PolicyType; title: string; content: string; version: number },
  revision?: { contentHash: string; effectiveAt: Date } | null,
) {
  return {
    type: row.type,
    title: row.title,
    content: row.content,
    version: row.version,
    contentHash: revision?.contentHash ?? null,
    effectiveAt: revision?.effectiveAt ?? null,
  }
}

/** Returns the immutable snapshot for the current published document, creating the initial
 *  snapshot for policy rows that existed before versioning was introduced. */
export async function getCurrentPolicyRevision(
  tx: Prisma.TransactionClient,
  type: PolicyType,
) {
  const page = await tx.policyPage.findUnique({ where: { type } })
  if (!page || !page.content.trim()) return null

  return tx.policyRevision.upsert({
    where: { policyPageId_version: { policyPageId: page.id, version: page.version } },
    create: {
      policyPageId: page.id,
      version: page.version,
      title: page.title,
      content: page.content,
      contentHash: policyContentHash(page.title, page.content),
    },
    update: {},
  })
}

/** A policy type with no row, or empty content, is simply omitted here -- the public Policy page
 *  only renders what an admin has actually written, mirroring how an unset social link hides its
 *  icon instead of rendering an empty/broken section. */
export async function listPolicies() {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.policyPage.findMany({ where: { content: { not: '' } }, orderBy: { type: 'asc' } })
    return Promise.all(
      rows.map(async (row) => {
        const revision = await tx.policyRevision.upsert({
          where: { policyPageId_version: { policyPageId: row.id, version: row.version } },
          create: {
            policyPageId: row.id,
            version: row.version,
            title: row.title,
            content: row.content,
            contentHash: policyContentHash(row.title, row.content),
          },
          update: {},
        })
        return toPublicPolicyPage(row, revision)
      }),
    )
  })
}

export async function updatePolicy(actor: Actor, type: PolicyType, input: { title?: string; content?: string }) {
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.policyPage.findUnique({ where: { type } })
    if (!existing) {
      const row = await tx.policyPage.create({
        data: { type, title: input.title ?? type, content: input.content ?? '' },
      })
      const revision = await getCurrentPolicyRevision(tx, type)
      return { row, revision }
    }

    const title = input.title ?? existing.title
    const content = input.content ?? existing.content
    if (title === existing.title && content === existing.content) {
      const revision = await getCurrentPolicyRevision(tx, type)
      return { row: existing, revision }
    }

    await getCurrentPolicyRevision(tx, type)
    const row = await tx.policyPage.update({
      where: { type },
      data: { title, content, version: { increment: 1 } },
    })
    const revision = await getCurrentPolicyRevision(tx, type)
    return { row, revision }
  })

  await recordAuditLog({
    userId: actor.userId,
    role: actor.role,
    action: 'settings.policy_update',
    entity: 'policy_pages',
    entityId: result.row.id,
  })
  return toPublicPolicyPage(result.row, result.revision)
}

/** Staff-only read (unlike listPolicies, which the public Policy page uses) -- the admin editor
 *  needs to see a type's current title/content even if content is still empty/unset. */
export async function getPolicyForAdmin(type: PolicyType) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.policyPage.findUnique({ where: { type } })
    if (!row) return { type, title: type, content: '', version: 1, contentHash: null, effectiveAt: null }
    const revision = await getCurrentPolicyRevision(tx, type)
    return toPublicPolicyPage(row, revision)
  })
}

function toPublicFaq(row: { id: number; question: string; answer: string; displayOrder: number; isPublished: boolean }) {
  return { id: row.id, question: row.question, answer: row.answer, displayOrder: row.displayOrder, isPublished: row.isPublished }
}

/** Public -- only published FAQs, in display order. Same "unpublished/unset simply isn't shown"
 *  convention as listPolicies/an unset social link. */
export async function listPublicFaqs() {
  const rows = await prisma.faq.findMany({ where: { isPublished: true }, orderBy: { displayOrder: 'asc' } })
  return rows.map(toPublicFaq)
}

/** Staff-only -- every FAQ including unpublished drafts, for the admin editor table. */
export async function listFaqsForAdmin() {
  const rows = await prisma.faq.findMany({ orderBy: { displayOrder: 'asc' } })
  return rows.map(toPublicFaq)
}

export async function createFaq(
  actor: Actor,
  input: { question: string; answer: string; displayOrder?: number; isPublished?: boolean },
) {
  const row = await prisma.faq.create({
    data: {
      question: input.question,
      answer: input.answer,
      displayOrder: input.displayOrder ?? 0,
      isPublished: input.isPublished ?? true,
    },
  })

  await recordAuditLog({ userId: actor.userId, role: actor.role, action: 'settings.faq_create', entity: 'faqs', entityId: row.id })
  return toPublicFaq(row)
}

export async function updateFaq(
  actor: Actor,
  id: number,
  input: { question?: string; answer?: string; displayOrder?: number; isPublished?: boolean },
) {
  const existing = await prisma.faq.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'FAQ not found.')

  const row = await prisma.faq.update({
    where: { id },
    data: { question: input.question, answer: input.answer, displayOrder: input.displayOrder, isPublished: input.isPublished },
  })

  await recordAuditLog({ userId: actor.userId, role: actor.role, action: 'settings.faq_update', entity: 'faqs', entityId: id })
  return toPublicFaq(row)
}

export async function deleteFaq(actor: Actor, id: number): Promise<void> {
  const existing = await prisma.faq.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'FAQ not found.')

  await prisma.faq.delete({ where: { id } })
  await recordAuditLog({ userId: actor.userId, role: actor.role, action: 'settings.faq_delete', entity: 'faqs', entityId: id })
}
