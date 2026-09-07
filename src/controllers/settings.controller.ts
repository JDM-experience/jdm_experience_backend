import type { Request, Response, NextFunction } from 'express'
import { ApiError } from '../middleware/errorHandler'
import * as settingsService from '../services/settings.service'
import { faqIdParamSchema, policyTypeParamSchema, socialLinkIdParamSchema } from '../validators/settings.validator'
import type { PolicyType } from '../generated/prisma/client'

function parseSocialLinkId(req: Request): number {
  const parsed = socialLinkIdParamSchema.safeParse(req.params)
  if (!parsed.success) throw new ApiError(400, 'id must be a positive integer.')
  return parsed.data.id
}

function parsePolicyType(req: Request): PolicyType {
  const parsed = policyTypeParamSchema.safeParse(req.params)
  if (!parsed.success) throw new ApiError(400, 'type must be a valid policy type.')
  return parsed.data.type
}

function parseFaqId(req: Request): number {
  const parsed = faqIdParamSchema.safeParse(req.params)
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

export async function getAbout(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await settingsService.getAboutContent() })
  } catch (error) {
    next(error)
  }
}

export async function updateAbout(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await settingsService.updateAboutContent(req.user!, req.body) })
  } catch (error) {
    next(error)
  }
}

export async function listPolicies(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await settingsService.listPolicies() })
  } catch (error) {
    next(error)
  }
}

export async function getPolicyForAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await settingsService.getPolicyForAdmin(parsePolicyType(req)) })
  } catch (error) {
    next(error)
  }
}

export async function updatePolicy(req: Request, res: Response, next: NextFunction) {
  try {
    const policy = await settingsService.updatePolicy(req.user!, parsePolicyType(req), req.body)
    res.json({ success: true, data: policy })
  } catch (error) {
    next(error)
  }
}

export async function listFaqs(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await settingsService.listPublicFaqs() })
  } catch (error) {
    next(error)
  }
}

export async function listFaqsAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await settingsService.listFaqsForAdmin() })
  } catch (error) {
    next(error)
  }
}

export async function createFaq(req: Request, res: Response, next: NextFunction) {
  try {
    const faq = await settingsService.createFaq(req.user!, req.body)
    res.status(201).json({ success: true, data: faq })
  } catch (error) {
    next(error)
  }
}

export async function updateFaq(req: Request, res: Response, next: NextFunction) {
  try {
    const faq = await settingsService.updateFaq(req.user!, parseFaqId(req), req.body)
    res.json({ success: true, data: faq })
  } catch (error) {
    next(error)
  }
}

export async function deleteFaq(req: Request, res: Response, next: NextFunction) {
  try {
    await settingsService.deleteFaq(req.user!, parseFaqId(req))
    res.json({ success: true, data: null })
  } catch (error) {
    next(error)
  }
}
