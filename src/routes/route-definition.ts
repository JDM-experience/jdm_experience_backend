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
  /** A single handler, or a middleware chain (e.g. [checkJwt, ping]) — the last entry does the
   *  actual responding. */
  handler: RequestHandler | RequestHandler[]
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
  /** OpenAPI tag(s) — Swagger UI groups/collapses endpoints by these. Usually set once per
   *  resource via `withTag()` in routes/index.ts rather than per route. */
  tags?: string[]
}

/** Stamps every route in `routes` with `tag` — one call per resource in routes/index.ts groups
 *  that resource's endpoints under a single collapsible section in Swagger UI. */
export function withTag(tag: string, routes: RouteDefinition[]): RouteDefinition[] {
  return routes.map((route) => ({ ...route, tags: [tag] }))
}

/** '/client/:id' -> '/api/client/{id}' — Express param syntax to OpenAPI's. */
export function toOpenApiPath(expressPath: string): string {
  return `/api${expressPath.replace(/:([A-Za-z0-9_]+)/g, '{$1}')}`
}
