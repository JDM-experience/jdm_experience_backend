import { z } from 'zod'

const paymentStatusEnum = z.enum(['UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED'])

export const recordPaymentSchema = z.object({
  bookingId: z.number().int().positive(),
  amount: z.number().positive(),
  provider: z.string().trim().max(50).optional(),
  paymentMethod: z.string().trim().max(30).optional(),
  transactionRef: z.string().trim().max(100).optional(),
  status: paymentStatusEnum.default('PAID'),
})

export const paymentProofSchema = z.object({
  fileUrl: z.string().trim().min(1).max(500),
  fileName: z.string().trim().min(1).max(255),
  fileType: z.string().trim().min(1).max(50),
})

export const bookingIdRouteParamSchema = z.object({ bookingId: z.coerce.number().int().positive() })
export const bookingIdForPaymentParamSchema = z.object({ id: z.coerce.number().int().positive() })

const paymentSchema = z
  .object({
    id: z.number().meta({ example: 1 }),
    bookingId: z.number().meta({ example: 1 }),
    provider: z.string().nullable().meta({ example: null }),
    amount: z.number().meta({ example: 25000 }),
    currency: z.string().meta({ example: 'JPY' }),
    status: paymentStatusEnum.meta({ example: 'PAID' }),
    paymentMethod: z.string().nullable().meta({ example: 'bank_transfer' }),
    paymentDate: z.string().meta({ example: '2026-08-11T10:26:53.912Z' }),
    paidAt: z.string().nullable().meta({ example: '2026-08-11T10:26:53.912Z' }),
    transactionRef: z.string().nullable().meta({ example: null }),
  })
  .meta({ id: 'Payment' })

export const paymentResponseSchema = z.object({ success: z.literal(true), data: paymentSchema }).meta({ id: 'PaymentResponse' })
export const paymentsListResponseSchema = z
  .object({ success: z.literal(true), data: z.array(paymentSchema) })
  .meta({ id: 'PaymentsListResponse' })

const paymentProofResponseDataSchema = z
  .object({
    id: z.number().meta({ example: 1 }),
    bookingId: z.number().meta({ example: 1 }),
    uploadedBy: z.number().meta({ example: 3 }),
    fileUrl: z.string().meta({ example: 'https://example.com/proof.jpg' }),
    fileName: z.string().meta({ example: 'proof.jpg' }),
    fileType: z.string().meta({ example: 'image/jpeg' }),
    createdAt: z.string().meta({ example: '2026-08-11T10:26:53.912Z' }),
  })
  .meta({ id: 'PaymentProof' })

export const paymentProofResponseSchema = z
  .object({ success: z.literal(true), data: paymentProofResponseDataSchema })
  .meta({ id: 'PaymentProofResponse' })
export const paymentProofsListResponseSchema = z
  .object({ success: z.literal(true), data: z.array(paymentProofResponseDataSchema) })
  .meta({ id: 'PaymentProofsListResponse' })
