import { z } from 'zod'

const platformEnum = z.enum(['FACEBOOK', 'INSTAGRAM', 'TIKTOK'])

export const updateContactSettingsSchema = z
  .object({
    contactEmail: z.string().trim().email('Enter a valid email address.').optional(),
    contactPhone: z.string().trim().max(50).optional(),
    address: z.string().trim().max(255).optional(),
    contactHours: z.string().trim().max(255).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update.' })

export const createSocialLinkSchema = z.object({
  platform: platformEnum,
  url: z.string().trim().url('Enter a valid URL.').max(500),
  enabled: z.boolean().default(true),
  displayOrder: z.number().int().nonnegative().default(0),
})

export const updateSocialLinkSchema = z
  .object({
    url: z.string().trim().url('Enter a valid URL.').max(500).optional(),
    enabled: z.boolean().optional(),
    displayOrder: z.number().int().nonnegative().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update.' })

export const socialLinkIdParamSchema = z.object({ id: z.coerce.number().int().positive() })

const contactSettingsSchema = z
  .object({
    locationName: z.string().nullable().meta({ example: 'Tokyo, Japan' }),
    address: z.string().nullable().meta({ example: '1-1 Chiyoda, Tokyo' }),
    latitude: z.number().meta({ example: 35.6812 }),
    longitude: z.number().meta({ example: 139.7671 }),
    timezone: z.string().nullable().meta({ example: 'Asia/Tokyo' }),
    contactEmail: z.string().nullable().meta({ example: 'hello@jdmexperience.dev' }),
    contactPhone: z.string().nullable().meta({ example: '+81-3-1234-5678' }),
    contactHours: z.string().nullable().meta({ example: '9:00-18:00 JST' }),
    bookingCutoffHour: z.number().int().meta({ example: 17 }),
  })
  .meta({ id: 'ContactSettings' })

export const contactSettingsResponseSchema = z
  .object({ success: z.literal(true), data: contactSettingsSchema })
  .meta({ id: 'ContactSettingsResponse' })

const socialLinkSchema = z
  .object({
    id: z.number().meta({ example: 1 }),
    platform: platformEnum.meta({ example: 'INSTAGRAM' }),
    url: z.string().meta({ example: 'https://instagram.com/jdmexperience' }),
    enabled: z.boolean().meta({ example: true }),
    displayOrder: z.number().int().meta({ example: 0 }),
  })
  .meta({ id: 'SocialLink' })

export const socialLinkResponseSchema = z
  .object({ success: z.literal(true), data: socialLinkSchema })
  .meta({ id: 'SocialLinkResponse' })

export const socialLinksListResponseSchema = z
  .object({ success: z.literal(true), data: z.array(socialLinkSchema) })
  .meta({ id: 'SocialLinksListResponse' })

export const deleteSocialLinkResponseSchema = z
  .object({ success: z.literal(true), data: z.null() })
  .meta({ id: 'DeleteSocialLinkResponse' })
