# jdm_experience_backend

Node.js/TypeScript REST API for the JDM Experience tour/reservation platform, with role-based
access control (SUPER_ADMIN/ADMIN/TOUR_GUIDE/CUSTOMER), PostgreSQL (Supabase) via Prisma, and
Auth0 for authentication. Full endpoint reference: interactive docs at `/api/docs`
(http://localhost:3000/api/docs locally, or https://jdm-experience-backend-one.vercel.app/api/docs
in production) — see [API documentation](#api-documentation) below for how it's generated.

The React frontend ([`jdm_experience_frontend`](https://github.com/achilleslucas79-bot/jdm_experience_frontend))
originally specified an earlier endpoint shape in its own `docs/BACKEND_REQUIREMENTS.md` — this
project implements the newer RBAC/tours/bookings architecture instead.

## Setup

Yarn is the enforced package manager (see `package.json`'s `preinstall` guard) —
`npm install`/`pnpm install` will refuse to run.

```bash
yarn install
cp .env.example .env   # fill in DATABASE_URL/DIRECT_URL and any secrets you have
yarn prisma generate
yarn prisma db push    # sync schema.prisma to the database
yarn dev
```

Server starts on `http://localhost:3000` (see `.env`). Health check: `GET /api/health`.

## API documentation

Interactive Swagger UI at `/api/docs` (local: http://localhost:3000/api/docs, production:
https://jdm-experience-backend-one.vercel.app/api/docs) — documents every endpoint's request/
response shape and status codes, and lets you try requests directly from the browser.

The spec is generated from the same `RouteDefinition[]` arrays that build the actual Express
router (`src/routes/*.routes.ts`, combined in `src/routes/index.ts`) — a route only gets defined
once, so the docs and the router can't drift out of sync with each other. `src/docs/openapi.ts`
just loops over that same array and registers each entry with `@asteasolutions/zod-to-openapi`.

To add a new endpoint (see `client.routes.ts` for the pattern):

1. Add `.meta({ id: '...', ... })` to its request/response Zod schemas in `src/validators/` —
   this names them as OpenAPI components and supplies field-level examples/descriptions
2. Add one entry to the resource's `RouteDefinition[]` array (method, path, handler, `request`
   params/query/body schemas, and a `responses` map covering every status code the endpoint can
   actually return)
3. Export that array from `src/routes/<resource>.routes.ts` and spread it into `allRoutes` in
   `src/routes/index.ts`

That's it — no separate step in `openapi.ts` itself.

`/api/docs` is mounted with a relaxed CSP (`script-src 'unsafe-inline'`, scoped to just that
route in `app.ts`) since Swagger UI's HTML ships an inline bootstrap script that the global
`helmet()` CSP would otherwise block in the browser — every other route keeps the strict default.

## Authentication (Auth0)

Protected routes use `checkJwt` (`src/middleware/auth.middleware.ts`), which verifies an
Auth0-issued bearer access token's signature, issuer, audience, and expiry against the tenant's
JWKS (via `express-oauth2-jwt-bearer` — no manual `jsonwebtoken`/JWKS plumbing). On success it
populates `req.auth.payload` with the token's decoded claims (`sub`, etc.).

Requires `AUTH0_DOMAIN` and `AUTH0_AUDIENCE` in `.env`, matching the frontend's
`VITE_AUTH0_DOMAIN`/`VITE_AUTH0_AUDIENCE` exactly (see `.env.example`).

`checkJwt` only verifies the token — it doesn't look up or attach a local user record. Linking a
verified token to a `User` row (JIT provisioning) is a separate, later concern.

An `UnauthorizedError` thrown by `checkJwt` (missing/invalid/expired token) is caught by the error
handler in `app.ts` and returned as `401` (`{ success: false, message: ... }`).

`GET /api/auth/ping` applies `checkJwt` and echoes back the verified token's `sub` claim — a
minimal diagnostic proving the middleware is wired end to end. Not meant to stick around once
real protected routes exist.

## Deployment

**Production**: https://jdm-experience-backend-one.vercel.app/

Deploys to Vercel — `main` auto-deploys to production, PRs get preview URLs. See
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the one-time dashboard setup (env vars, GitHub
connection) and how the Express app is wrapped as a serverless function (`api/index.ts`,
`vercel.json`).

## Database (Prisma + Supabase Postgres)

The datasource is Supabase Postgres. Supabase gives you two connection strings — both are
required, for different reasons:

| Env var | Port | Used by | Why |
|---|---|---|---|
| `DATABASE_URL` | 6543 | the app at runtime (`src/config/prisma.ts`, via `@prisma/adapter-pg`) | pgbouncer transaction-mode pooling, safe for many short-lived connections |
| `DIRECT_URL` | 5432 | Prisma Migrate/`db push` (`prisma.config.ts`) | transaction pooling doesn't support the DDL/prepared statements migrations need |

Note the connection URL split is unusual for Prisma 7: connection URLs are no longer read from
`datasource.url`/`directUrl` in `schema.prisma` — the CLI (Migrate/`db push`) reads its URL from
`prisma.config.ts`, and the runtime `PrismaClient` gets its URL by constructing a driver adapter
explicitly in `src/config/prisma.ts`. `schema.prisma`'s `datasource` block only declares the
`provider`.

After changing `schema.prisma`, sync it to the database with `yarn prisma db push` (or use
`yarn prisma migrate dev` once you want tracked migration history instead of push-based syncing).

Verify the connection end to end (raw query + a real model create/read) with:

```bash
yarn db:test
```

If this ever needs to move to a MySQL-only host (e.g. Hostinger), see
[`docs/DATABASE_MIGRATION.md`](docs/DATABASE_MIGRATION.md) for the schema/code changes and how
to move existing data across.

Seed development fixtures (a SUPER_ADMIN, ADMIN, 2 TOUR_GUIDEs, a CUSTOMER, 2 tours, sample
booking/contact-message — all fake `seed.*@example.com` accounts, password `Password123!`):

```bash
yarn seed
```

## Scripts

| Script | Purpose |
|---|---|
| `yarn dev` | Start with hot-reload (`tsx watch`) |
| `yarn build` | Compile TypeScript to `dist/` |
| `yarn start` | Run the compiled build (`dist/server.js`) |
| `yarn test` | Run the test suite (`vitest`) |
| `yarn seed` | Seed development fixtures (idempotent) |
| `yarn db:test` | Verify the Prisma <-> database connection |

## Structure

```
api/
  index.ts      Vercel serverless entry — wraps src/app.ts (see docs/DEPLOYMENT.md)
src/
  app.ts        Express app (middleware, routes) — imported by both api/index.ts and server.ts
  server.ts     local dev entry only (app.listen) — not used in the Vercel deployment
  config/       env loading + typed config, Prisma client
  routes/       Express routers, mounted under /api
  controllers/  request handlers (route -> service glue)
  services/     business logic, DB access
  middleware/   auth, RBAC/ownership, validation, error handling
  validators/   Zod schemas per resource (also drive the OpenAPI spec via .meta())
  docs/         OpenAPI document generator, served at /api/docs (see "API documentation" above)
  lib/          Auth0 helpers, JST date/time
  types/        shared TS types, Express Request augmentation
  generated/    Prisma Client output (gitignored — regenerate with `yarn prisma generate`)
prisma/
  schema.prisma          the full data model
  migrations/             migration history
  seed.ts                 development fixtures
  migrate-admin-users.ts  one-time legacy admin_users -> users migration (already run)
```

See the [API documentation](#api-documentation) section above for the full endpoint-by-endpoint
reference — RBAC rules and multi-endpoint resources will be added there as they're built.
