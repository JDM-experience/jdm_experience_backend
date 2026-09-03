import { z } from 'zod'

export const createPaymentMethodSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(100),
  description: z.string().trim().max(500).optional(),
  imageUrl: z.string().trim().max(500).optional(),
  isActive: z.boolean().default(true),
})

export const updatePaymentMethodSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).optional(),
    imageUrl: z.string().trim().max(500).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update.' })

export const paymentMethodIdParamSchema = z.object({ id: z.coerce.number().int().positive() })

const paymentMethodSchema = z
  .object({
    id: z.number().meta({ example: 1 }),
    name: z.string().meta({ example: 'GCash' }),
    description: z.string().nullable().meta({ example: 'Pay via GCash QR code.' }),
    imageUrl: z.string().nullable().meta({ example: 'https://.../gcash.png' }),
    isActive: z.boolean().meta({ example: true }),
    createdAt: z.string().meta({ example: '2026-08-11T10:26:53.912Z' }),
    updatedAt: z.string().meta({ example: '2026-08-11T10:26:53.912Z' }),
  })
  .meta({ id: 'PaymentMethod' })

export const paymentMethodResponseSchema = z
  .object({ success: z.literal(true), data: paymentMethodSchema })
  .meta({ id: 'PaymentMethodResponse' })
export const paymentMethodsListResponseSchema = z
  .object({ success: z.literal(true), data: z.array(paymentMethodSchema) })
  .meta({ id: 'PaymentMethodsListResponse' })
export const deletePaymentMethodResponseSchema = z
  .object({ success: z.literal(true), data: z.null() })
  .meta({ id: 'DeletePaymentMethodResponse' })
