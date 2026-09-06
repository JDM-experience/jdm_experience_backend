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
    tags: route.tags,
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
  // Declared explicitly (rather than left to Swagger UI to infer) so groups appear in this
  // order regardless of where each resource's routes happen to sit in allRoutes.
  tags: [
    { name: 'Health', description: 'Liveness/readiness check.' },
    { name: 'Client', description: 'Public-facing client-info endpoints.' },
    { name: 'Auth', description: 'Auth0 token verification and the authenticated user profile.' },
    { name: 'Users', description: 'User account management.' },
    { name: 'Settings', description: 'Site-wide settings.' },
    { name: 'Contact Messages', description: 'Public contact form + staff inbox.' },
    { name: 'Tours', description: 'Tours, their images, guides, and booked dates.' },
    { name: 'Uploads', description: 'Signed upload URLs for tour images (Supabase Storage).' },
    { name: 'Bookings', description: 'Customer bookings.' },
    { name: 'Payments', description: 'Payment records for bookings.' },
    { name: 'Payment Methods', description: 'Configured payment methods for checkout.' },
    { name: 'Customers', description: 'Customer accounts (staff view).' },
    { name: 'Reviews', description: 'Tour reviews from customers who completed a booking.' },
    { name: 'Weather', description: 'Forecast for the fixed JDM Experience location, proxied from Open-Meteo.' },
    { name: 'Currency', description: 'Currency conversion for display only, proxied from an exchange-rate provider.' },
    { name: 'Dashboard', description: 'Sales, revenue, and tour-performance reporting for staff.' },
  ],
})
