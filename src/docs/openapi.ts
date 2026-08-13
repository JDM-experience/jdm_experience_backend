import { OpenApiGeneratorV3, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import type { ZodType } from 'zod'
import { allRoutes } from '../routes'
import { toOpenApiPath } from '../routes/route-definition'

const registry = new OpenAPIRegistry()

// Every route's docs are generated here from the same RouteDefinition array
// that builds the Express router (src/routes/index.ts) — adding a new
// endpoint only means adding one entry to that array, not a second one here.
for (const route of allRoutes) {
  const responses: Record<string, { description: string; content?: { 'application/json': { schema: ZodType } } }> = {}
  for (const [status, def] of Object.entries(route.responses)) {
    responses[status] = {
      description: def.description,
      ...(def.schema ? { content: { 'application/json': { schema: def.schema } } } : {}),
    }
  }

  registry.registerPath({
    method: route.method,
    path: toOpenApiPath(route.path),
    summary: route.summary,
    description: route.description,
    request: route.request
      ? {
          params: route.request.params,
          query: route.request.query,
          body: route.request.body
            ? { content: { 'application/json': { schema: route.request.body } } }
            : undefined,
        }
      : undefined,
    responses,
  })
}

const generator = new OpenApiGeneratorV3(registry.definitions)

export const openApiDocument = generator.generateDocument({
  openapi: '3.0.0',
  info: {
    title: 'jdm_experience_backend API',
    version: '1.0.0',
    description: 'See README.md and docs/DEPLOYMENT.md for setup and deployment context.',
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Local dev' },
    { url: 'https://jdm-experience-backend-one.vercel.app', description: 'Production' },
  ],
})
