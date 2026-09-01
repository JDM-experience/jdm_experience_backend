import type { NextFunction, Request, Response } from 'express'
import { UnauthorizedError } from 'express-oauth2-jwt-bearer'
import { Prisma } from '../generated/prisma/client'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ success: false, message: `Not found: ${req.method} ${req.originalUrl}` })
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ success: false, message: err.message })
    return
  }

  // Thrown by express-oauth2-jwt-bearer when the Auth0 bearer token is missing, malformed,
  // expired, or fails signature/audience/issuer verification.
  if (err instanceof UnauthorizedError) {
    res.status(err.status).json({ success: false, message: err.message })
    return
  }

  // Prisma unique-constraint violation (duplicate email/slug/etc.) — one central 409 instead of
  // every service re-checking existence before every write.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const fields = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'value'
    res.status(409).json({ success: false, message: `A record with this ${fields} already exists.` })
    return
  }

  console.error(err)
  res.status(500).json({ success: false, message: 'Internal server error' })
}
