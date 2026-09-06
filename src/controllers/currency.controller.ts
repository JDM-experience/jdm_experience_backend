import type { Request, Response, NextFunction } from 'express'
import * as currencyService from '../services/currency.service'
import type { convertCurrencyQuerySchema } from '../validators/currency.validator'
import type { z } from 'zod'

export async function convert(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to, amount } = req.query as unknown as z.infer<typeof convertCurrencyQuerySchema>
    res.json({ success: true, data: await currencyService.convert({ from, to, amount }) })
  } catch (error) {
    next(error)
  }
}

export async function listCurrencies(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await currencyService.getSupportedCurrencies() })
  } catch (error) {
    next(error)
  }
}
