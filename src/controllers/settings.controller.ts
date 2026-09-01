import type { Request, Response, NextFunction } from 'express'
import { ApiError } from '../middleware/errorHandler'
import * as settingsService from '../services/settings.service'
import { socialLinkIdParamSchema } from '../validators/settings.validator'

function parseSocialLinkId(req: Request): number {
  const parsed = socialLinkIdParamSchema.safeParse(req.params)
  if (!parsed.success) throw new ApiError(400, 'id must be a positive integer.')
  return parsed.data.id
}

export async function getContact(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await settingsService.getPublicSettings() })
  } catch (error) {
    next(error)
  }
}

export async function updateContact(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await settingsService.updateContactSettings(req.user!, req.body) })
  } catch (error) {
    next(error)
  }
}

export async function listSocialLinks(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await settingsService.listSocialLinks() })
  } catch (error) {
    next(error)
  }
}

export async function createSocialLink(req: Request, res: Response, next: NextFunction) {
  try {
    const link = await settingsService.createSocialLink(req.user!, req.body)
    res.status(201).json({ success: true, data: link })
  } catch (error) {
    next(error)
  }
}

export async function updateSocialLink(req: Request, res: Response, next: NextFunction) {
  try {
    const link = await settingsService.updateSocialLink(req.user!, parseSocialLinkId(req), req.body)
    res.json({ success: true, data: link })
  } catch (error) {
    next(error)
  }
}

export async function deleteSocialLink(req: Request, res: Response, next: NextFunction) {
  try {
    await settingsService.deleteSocialLink(req.user!, parseSocialLinkId(req))
    res.json({ success: true, data: null })
  } catch (error) {
    next(error)
  }
}
