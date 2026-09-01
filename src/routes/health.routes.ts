import { getHealth } from '../controllers/health.controller'
import { healthResponseSchema } from '../validators/health.validator'
import type { RouteDefinition } from './route-definition'

export const healthRoutes: RouteDefinition[] = [
  {
    method: 'get',
    path: '/health',
    handler: getHealth,
    summary: 'Health check',
    responses: {
      200: { description: 'Service is up.', schema: healthResponseSchema },
    },
  },
]
