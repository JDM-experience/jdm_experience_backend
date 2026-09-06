import { z } from 'zod'

export const updateCustomerProfileSchema = z
  .object({
    phone: z.string().trim().max(50).optional(),
    nationality: z.string().trim().max(100).optional(),
    passportNumber: z.string().trim().max(50).optional(),
    licenseNumber: z.string().trim().max(50).optional(),
    licenseCountry: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update.' })

export const customerUserIdParamSchema = z.object({ userId: z.coerce.number().int().positive() })

// A plain boolean query param arrives as the literal string "true"/"false" -- z.coerce.boolean()
// would incorrectly treat "false" as truthy (non-empty string), so this maps the two accepted
// strings explicitly instead.
const boolQueryParam = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'))

export const customerListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  isActive: boolQueryParam,
})

const customerSchema = z
  .object({
    id: z.number().meta({ example: 3 }),
    fullName: z.string().nullable().meta({ example: 'Jane Doe' }),
    email: z.string().meta({ example: 'jane@example.com' }),
    username: z.string().nullable().meta({ example: null }),
    role: z.literal('CUSTOMER'),
    authProvider: z.literal('AUTH0'),
    isActive: z.boolean().meta({ example: true }),
    createdAt: z.string().meta({ example: '2026-08-11T10:26:53.912Z' }),
    phone: z.string().nullable().meta({ example: '+81-90-1234-5678' }),
    nationality: z.string().nullable().meta({ example: 'Philippines' }),
    passportNumber: z.string().nullable().meta({ example: null }),
    licenseNumber: z.string().nullable().meta({ example: null }),
    licenseCountry: z.string().nullable().meta({ example: null }),
    notes: z.string().nullable().meta({ example: null }),
  })
  .meta({ id: 'CustomerProfile' })

export const customerResponseSchema = z
  .object({ success: z.literal(true), data: customerSchema })
  .meta({ id: 'CustomerProfileResponse' })

export const customersListResponseSchema = z
  .object({ success: z.literal(true), data: z.array(customerSchema) })
  .meta({ id: 'CustomerProfilesListResponse' })
