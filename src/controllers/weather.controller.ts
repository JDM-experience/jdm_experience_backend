import type { Request, Response, NextFunction } from 'express'
import * as weatherService from '../services/weather.service'

export async function getForecast(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await weatherService.getForecast() })
  } catch (error) {
    next(error)
  }
}
