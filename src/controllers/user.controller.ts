import type { Request, Response, NextFunction } from 'express'
import { ApiError } from '../middleware/errorHandler'
import * as userService from '../services/user.service'
import { userIdParamSchema } from '../validators/user.validator'
import type { Role } from '../generated/prisma/client'

function parseUserId(req: Request): number {
  const parsed = userIdParamSchema.safeParse(req.params)
  if (!parsed.success) throw new ApiError(400, 'id must be a positive integer.')
  return parsed.data.id
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { role, search } = req.query as { role?: Role; search?: string }
    res.json({ success: true, data: await userService.listUsers({ role, search }) })
  } catch (error) {
    next(error)
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await userService.getUser(parseUserId(req)) })
  } catch (error) {
    next(error)
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await userService.createUser(req.user!, req.body)
    res.status(201).json({ success: true, data: user })
  } catch (error) {
    next(error)
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await userService.updateUser(req.user!, parseUserId(req), req.body)
    res.json({ success: true, data: user })
  } catch (error) {
    next(error)
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await userService.deactivateUser(req.user!, parseUserId(req))
    res.json({ success: true, data: null })
  } catch (error) {
    next(error)
  }
}
