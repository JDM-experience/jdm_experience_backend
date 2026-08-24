import type { RequestHandler } from 'express'
import type { ZodType } from 'zod'
import { ApiError } from './errorHandler'

/** Validates `req.body` against `schema`, replacing it with the parsed (and defaulted) result.
 *  422 with a field-level message on failure. */
export function validateBody(schema: ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      const message = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
      next(new ApiError(422, message))
      return
    }
    req.body = result.data
    next()
  }
}

/** Validates `req.query` against `schema`, replacing it with the parsed (and defaulted) result.
 *  422 with a field-level message on failure. */
export function validateQuery(schema: ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.query)
    if (!result.success) {
      const message = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
      next(new ApiError(422, message))
      return
    }
    req.query = result.data as typeof req.query
    next()
  }
}
