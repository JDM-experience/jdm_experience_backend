import { z } from 'zod'

const cancellationRequestStatusEnum = z.enum(['PENDING', 'APPROVED', 'REFUND_PROCESSING', 'REFUNDED', 'REJECTED'])

export const createCancellationRequestSchema = z.object({
  bookingId: z.number().int().positive(),
  reason: z.string().trim().min(1, 'A cancellation reason is required.').max(2000),
  refundMethodId: z.number().int().positive(),
  refundDestination: z.string().trim().min(1, 'Refund destination details are required.').max(500),
})

export const rejectCancellationRequestSchema = z.object({
  rejectionReason: z.string().trim().min(1, 'A rejection reason is required.').max(1000),
})

// Reuses the exact same shape as payment.validator.ts's paymentProofSchema -- a refund proof is
// metadata-only (file lives in Supabase Storage), same as a payment proof.
export const refundProofSchema = z.object({
  fileUrl: z.string().trim().min(1, 'Refund proof is required.').max(500),
  fileName: z.string().trim().min(1).max(255),
  fileType: z.string().trim().min(1).max(50),
})

export const cancellationRequestIdParamSchema = z.object({ id: z.coerce.number().int().positive() })

export const cancellationRequestListQuerySchema = z.object({
  status: cancellationRequestStatusEnum.optional(),
})

const cancellationRequestSchema = z
  .object({
    id: z.number().meta({ example: 1 }),
    bookingId: z.number().meta({ example: 12 }),
    customerId: z.number().meta({ example: 3 }),
    reason: z.string().meta({ example: 'Change of plans' }),
    refundMethodId: z.number().nullable().meta({ example: 1 }),
    refundMethodName: z.string().meta({ example: 'PayPal' }),
    refundDestination: z.string().meta({ example: 'customer@example.com' }),
    refundAmount: z.number().meta({ example: 50000 }),
    status: cancellationRequestStatusEnum.meta({ example: 'PENDING' }),
    rejectionReason: z.string().nullable().meta({ example: null }),
    refundProofUrl: z.string().nullable().meta({ example: null }),
    refundProofFileName: z.string().nullable().meta({ example: null }),
    refundProofFileType: z.string().nullable().meta({ example: null }),
    approvedAt: z.string().nullable().meta({ example: null }),
    rejectedAt: z.string().nullable().meta({ example: null }),
    refundedAt: z.string().nullable().meta({ example: null }),
    createdAt: z.string().meta({ example: '2026-08-11T10:26:53.912Z' }),
  })
  .meta({ id: 'CancellationRequest' })

export const cancellationRequestResponseSchema = z
  .object({ success: z.literal(true), data: cancellationRequestSchema })
  .meta({ id: 'CancellationRequestResponse' })
export const cancellationRequestsListResponseSchema = z
  .object({ success: z.literal(true), data: z.array(cancellationRequestSchema) })
  .meta({ id: 'CancellationRequestsListResponse' })
