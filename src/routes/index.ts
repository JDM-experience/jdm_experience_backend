import { Router } from 'express'
import { authRoutes } from './auth.routes'
import { clientRoutes } from './client.routes'
import { healthRoutes } from './health.routes'
import type { RouteDefinition } from './route-definition'

// The single source of truth for every route — both the Express router below
// and the OpenAPI doc (src/docs/openapi.ts) are generated from this array,
// so a new endpoint only needs to be added here once.
export const allRoutes: RouteDefinition[] = [...healthRoutes, ...clientRoutes, ...authRoutes]

const router = Router()

for (const route of allRoutes) {
  const handlers = Array.isArray(route.handler) ? route.handler : [route.handler]
  router[route.method](route.path, ...handlers)
}

export default router
