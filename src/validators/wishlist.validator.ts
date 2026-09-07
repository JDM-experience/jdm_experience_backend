import { z } from 'zod'
import { tourSchema } from './tour.validator'

export const addToWishlistSchema = z.object({
  tourId: z.number().int().positive(),
})

export const wishlistTourIdParamSchema = z.object({ tourId: z.coerce.number().int().positive() })

const wishlistItemSchema = z
  .object({
    id: z.number().meta({ example: 1 }),
    tourId: z.number().meta({ example: 3 }),
    createdAt: z.string().meta({ example: '2026-08-11T10:26:53.912Z' }),
    tour: tourSchema,
  })
  .meta({ id: 'WishlistItem' })

export const wishlistItemResponseSchema = z
  .object({ success: z.literal(true), data: wishlistItemSchema })
  .meta({ id: 'WishlistItemResponse' })
export const wishlistListResponseSchema = z
  .object({ success: z.literal(true), data: z.array(wishlistItemSchema) })
  .meta({ id: 'WishlistListResponse' })
export const removeFromWishlistResponseSchema = z
  .object({ success: z.literal(true), data: z.null() })
  .meta({ id: 'RemoveFromWishlistResponse' })
