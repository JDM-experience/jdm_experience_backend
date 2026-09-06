import type { Request, Response, NextFunction } from 'express'
import * as dashboardService from '../services/dashboard.service'
import type { DashboardFilter } from '../services/dashboard.service'

export async function getSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const filter = req.query as unknown as DashboardFilter
    res.json({ success: true, data: await dashboardService.getDashboardSummary(filter) })
  } catch (error) {
    next(error)
  }
}
