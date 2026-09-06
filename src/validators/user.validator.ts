import { z } from 'zod'

const roleEnum = z.enum(['SUPER_ADMIN', 'ADMIN', 'TOUR_GUIDE', 'CUSTOMER'])

export const createUserSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required.').max(255),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  role: roleEnum.default('CUSTOMER'),
})

export const updateUserSchema = z
  .object({
    fullName: z.string().trim().min(1).max(255).optional(),
    email: z.string().trim().toLowerCase().email('Enter a valid email address.').optional(),
    role: roleEnum.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update.' })

export const userIdParamSchema = z.object({ id: z.coerce.number().int().positive() })
export const userListQuerySchema = z.object({
  role: roleEnum.optional(),
  search: z.string().trim().max(100).optional(),
})

const userSchema = z
  .object({
    id: z.number().meta({ example: 1 }),
    fullName: z.string().nullable().meta({ example: 'Jane Doe' }),
    email: z.string().meta({ example: 'jane@example.com' }),
    username: z.string().nullable().meta({ example: null }),
    role: roleEnum.meta({ example: 'CUSTOMER' }),
    authProvider: z.literal('AUTH0').meta({ example: 'AUTH0' }),
    isActive: z.boolean().meta({ example: true }),
    createdAt: z.string().meta({ example: '2026-08-11T10:26:53.912Z' }),
  })
  .meta({ id: 'User' })

export const userResponseSchema = z.object({ success: z.literal(true), data: userSchema }).meta({ id: 'UserResponse' })

export const usersListResponseSchema = z
  .object({ success: z.literal(true), data: z.array(userSchema) })
  .meta({ id: 'UsersListResponse' })

export const deactivateUserResponseSchema = z
  .object({ success: z.literal(true), data: z.null() })
  .meta({ id: 'DeactivateUserResponse' })
