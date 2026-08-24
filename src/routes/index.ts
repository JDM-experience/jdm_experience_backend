import { Router } from 'express'
import { authRoutes } from './auth.routes'
import { bookingsRoutes } from './bookings.routes'
import { clientRoutes } from './client.routes'
import { contactMessagesRoutes } from './contactMessages.routes'
import { healthRoutes } from './health.routes'
import { paymentsRoutes } from './payments.routes'
import type { RouteDefinition } from './route-definition'
import { settingsRoutes } from './settings.routes'
import { toursRoutes } from './tours.routes'
import { usersRoutes } from './users.routes'

// The single source of truth for every route — both the Express router below
// and the OpenAPI doc (src/docs/openapi.ts) are generated from this array,
// so a new endpoint only needs to be added here once.
export const allRoutes: RouteDefinition[] = [
  ...healthRoutes,
  ...clientRoutes,
  ...authRoutes,
  ...usersRoutes,
  ...settingsRoutes,
  ...contactMessagesRoutes,
  ...toursRoutes,
  ...bookingsRoutes,
  ...paymentsRoutes,
]

const router = Router()

for (const route of allRoutes) {
  const handlers = Array.isArray(route.handler) ? route.handler : [route.handler]
  router[route.method](route.path, ...handlers)
}

export default router
