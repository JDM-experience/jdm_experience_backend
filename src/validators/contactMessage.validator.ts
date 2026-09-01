import { z } from 'zod'

const statusEnum = z.enum(['NEW', 'READ', 'REPLIED', 'ARCHIVED'])

export const createContactMessageSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(100),
  subject: z.string().trim().max(255).optional(),
  message: z.string().trim().min(1, 'Message is required.').max(5000),
})

export const updateContactMessageSchema = z
  .object({ status: statusEnum.optional() })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update.' })

export const contactMessageIdParamSchema = z.object({ id: z.coerce.number().int().positive() })

const contactMessageSchema = z
  .object({
    id: z.number().meta({ example: 1 }),
    name: z.string().nullable().meta({ example: 'Jane Doe' }),
    email: z.string().nullable().meta({ example: 'jane@example.com' }),
    subject: z.string().nullable().meta({ example: 'Booking question' }),
    message: z.string().nullable().meta({ example: 'Is the Mt. Fuji tour available in December?' }),
    status: statusEnum.meta({ example: 'NEW' }),
    createdAt: z.string().meta({ example: '2026-08-11T10:26:53.912Z' }),
    updatedAt: z.string().meta({ example: '2026-08-11T10:26:53.912Z' }),
  })
  .meta({ id: 'ContactMessage' })

export const contactMessageResponseSchema = z
  .object({ success: z.literal(true), data: contactMessageSchema })
  .meta({ id: 'ContactMessageResponse' })

export const contactMessagesListResponseSchema = z
  .object({ success: z.literal(true), data: z.array(contactMessageSchema) })
  .meta({ id: 'ContactMessagesListResponse' })

export const deleteContactMessageResponseSchema = z
  .object({ success: z.literal(true), data: z.null() })
  .meta({ id: 'DeleteContactMessageResponse' })
