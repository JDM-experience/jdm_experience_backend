import type { NextFunction, Request, Response } from 'express'
import * as uploadService from '../services/upload.service'

export async function createTourImageUpload(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await uploadService.createTourImageUploadUrl(req.body)
    res.status(201).json({ success: true, data })
  } catch (error) {
    next(error)
  }
}

export async function createPaymentMethodImageUpload(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await uploadService.createPaymentMethodImageUploadUrl(req.body)
    res.status(201).json({ success: true, data })
  } catch (error) {
    next(error)
  }
}

export async function createPaymentProofUpload(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await uploadService.createPaymentProofUploadUrl(req.body)
    res.status(201).json({ success: true, data })
  } catch (error) {
    next(error)
  }
}
