import type { RequestHandler } from 'express'
import type { ZodObject, ZodType } from 'zod'

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'

export interface ResponseDef {
  description: string
  schema?: ZodType
}

export interface RouteDefinition {
  method: HttpMethod
  /** Express-style path, e.g. '/client/:id' — relative to the /api mount. */
  path: string
  handler: RequestHandler
  summary: string
  description?: string
  request?: {
    // params/query must be ZodObject (not a generic ZodType) — that's what
    // zod-to-openapi's RouteParameter type requires.
    params?: ZodObject
    query?: ZodObject
    body?: ZodType
  }
  responses: Record<number, ResponseDef>
}

/** '/client/:id' -> '/api/client/{id}' — Express param syntax to OpenAPI's. */
export function toOpenApiPath(expressPath: string): string {
  return `/api${expressPath.replace(/:([A-Za-z0-9_]+)/g, '{$1}')}`
}
