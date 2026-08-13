import { Router } from 'express'
import { clientRoutes } from './client.routes'
import { healthRoutes } from './health.routes'
import type { RouteDefinition } from './route-definition'

// The single source of truth for every route — both the Express router below
// and the OpenAPI doc (src/docs/openapi.ts) are generated from this array,
// so a new endpoint only needs to be added here once.
export const allRoutes: RouteDefinition[] = [...healthRoutes, ...clientRoutes]

const router = Router()

for (const route of allRoutes) {
  router[route.method](route.path, route.handler)
}

export default router
