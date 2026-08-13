import { OpenApiGeneratorV3, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { clientIdParamSchema } from '../validators/client.validator'

const registry = new OpenAPIRegistry()

const healthResponseSchema = z
  .object({ status: z.literal('ok') })
  .meta({ id: 'HealthResponse' })

const clientSchema = z
  .object({
    id: z.number().meta({ example: 2 }),
    firstName: z.string().meta({ example: 'John' }),
    lastName: z.string().meta({ example: 'doe' }),
    age: z.number().meta({ example: 20 }),
    createdAt: z.string().meta({ example: '2026-08-11T10:26:53.912Z' }),
  })
  .meta({ id: 'Client' })

const getClientResponseSchema = z
  .object({ status: z.literal('ok'), client: clientSchema })
  .meta({ id: 'GetClientResponse' })

const errorResponseSchema = z
  .object({ error: z.unknown() })
  .meta({ id: 'ErrorResponse', description: 'Zod validation errors, or a plain message string.' })

registry.registerPath({
  method: 'get',
  path: '/api/health',
  summary: 'Health check',
  responses: {
    200: {
      description: 'Service is up.',
      content: { 'application/json': { schema: healthResponseSchema } },
    },
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/client/{id}',
  summary: 'Get a client by id',
  request: {
    params: clientIdParamSchema,
  },
  responses: {
    200: {
      description: 'Client found.',
      content: { 'application/json': { schema: getClientResponseSchema } },
    },
    400: {
      description: 'id was not a positive integer.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    404: {
      description: 'No client with that id.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
})

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
