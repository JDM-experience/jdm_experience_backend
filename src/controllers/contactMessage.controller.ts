import type { Request, Response, NextFunction } from 'express'
import { ApiError } from '../middleware/errorHandler'
import * as contactMessageService from '../services/contactMessage.service'
import { contactMessageIdParamSchema } from '../validators/contactMessage.validator'
import type { ContactMessageStatus } from '../generated/prisma/client'

function parseMessageId(req: Request): number {
  const parsed = contactMessageIdParamSchema.safeParse(req.params)
  if (!parsed.success) throw new ApiError(400, 'id must be a positive integer.')
  return parsed.data.id
}

export async function submit(req: Request, res: Response, next: NextFunction) {
  try {
    const message = await contactMessageService.submitMessage(req.body)
    res.status(201).json({ success: true, data: message })
  } catch (error) {
    next(error)
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { search, status } = req.query as { search?: string; status?: ContactMessageStatus }
    res.json({ success: true, data: await contactMessageService.listMessages({ search, status }) })
  } catch (error) {
    next(error)
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await contactMessageService.getMessage(parseMessageId(req)) })
  } catch (error) {
    next(error)
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const message = await contactMessageService.updateMessageStatus(req.user!, parseMessageId(req), req.body.status)
    res.json({ success: true, data: message })
  } catch (error) {
    next(error)
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await contactMessageService.deleteMessage(req.user!, parseMessageId(req))
    res.json({ success: true, data: null })
  } catch (error) {
    next(error)
  }
}
