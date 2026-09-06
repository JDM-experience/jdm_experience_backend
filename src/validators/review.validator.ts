import { z } from 'zod'

export const createReviewSchema = z.object({
  rating: z.number().int().min(1, 'Rating must be between 1 and 5.').max(5, 'Rating must be between 1 and 5.'),
  comment: z.string().trim().min(1, 'Comment is required.').max(2000, 'Comment is too long.'),
})

export const updateReviewSchema = z
  .object({
    rating: z.number().int().min(1, 'Rating must be between 1 and 5.').max(5, 'Rating must be between 1 and 5.').optional(),
    comment: z.string().trim().min(1, 'Comment is required.').max(2000, 'Comment is too long.').optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update.' })

export const reviewIdParamSchema = z.object({ id: z.coerce.number().int().positive() })
export const tourIdParamSchema = z.object({ tourId: z.coerce.number().int().positive() })

const reviewSchema = z
  .object({
    id: z.number().meta({ example: 1 }),
    userId: z.number().meta({ example: 12 }),
    userName: z.string().nullable().meta({ example: 'Taro Yamada' }),
    tourId: z.number().meta({ example: 5 }),
    rating: z.number().int().meta({ example: 5 }),
    comment: z.string().meta({ example: 'Great experience!' }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Review' })

export const reviewResponseSchema = z.object({ success: z.literal(true), data: reviewSchema }).meta({ id: 'ReviewResponse' })

export const reviewsListResponseSchema = z
  .object({
    success: z.literal(true),
    data: z.object({
      reviews: z.array(reviewSchema),
      averageRating: z.number().nullable().meta({ example: 4.8 }),
      totalCount: z.number().int().meta({ example: 24 }),
    }),
  })
  .meta({ id: 'ReviewsListResponse' })

export const deleteReviewResponseSchema = z
  .object({ success: z.literal(true), data: z.null() })
  .meta({ id: 'DeleteReviewResponse' })
