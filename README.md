# jdm_experience_backend

Node.js/TypeScript REST API for the JDM Experience tour/reservation platform, with role-based
access control (SUPER_ADMIN/ADMIN/TOUR_GUIDE/CUSTOMER), PostgreSQL (Supabase) via Prisma,
JWT-in-cookie auth, Google Sign-In, and reCAPTCHA verification. Full endpoint reference:
[`docs/API.md`](docs/API.md).

The React frontend ([`jdm_experience_frontend`](https://github.com/achilleslucas79-bot/jdm_experience_frontend))
originally specified an earlier endpoint shape in its own `docs/BACKEND_REQUIREMENTS.md` — this
project implements the newer RBAC/tours/bookings architecture described in `docs/API.md` instead
(see that doc's intro for how the two relate).

## Setup

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL/DIRECT_URL and any secrets you have
npx prisma generate
npx prisma db push     # sync schema.prisma to the database
npm run dev
```

Server starts on `http://localhost:3000` (see `.env`). Health check: `GET /api/health`.

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

After changing `schema.prisma`, sync it to the database with `npx prisma db push` (or use
`prisma migrate dev` once you want tracked migration history instead of push-based syncing).

Verify the connection end to end (raw query + a real model create/read) with:

```bash
npm run db:test
```

If this ever needs to move to a MySQL-only host (e.g. Hostinger), see
[`docs/DATABASE_MIGRATION.md`](docs/DATABASE_MIGRATION.md) for the schema/code changes and how
to move existing data across.

Seed development fixtures (a SUPER_ADMIN, ADMIN, 2 TOUR_GUIDEs, a CUSTOMER, 2 tours, sample
booking/contact-message — all fake `seed.*@example.com` accounts, password `Password123!`):

```bash
npm run seed
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start with hot-reload (`tsx watch`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled build (`dist/server.js`) |
| `npm test` | Run the test suite (`vitest`) |
| `npm run seed` | Seed development fixtures (idempotent) |

## Structure

```
src/
  config/       env loading + typed config, Prisma client
  routes/       Express routers, mounted under /api
  controllers/  request handlers (route -> service glue)
  services/     business logic, DB access
  middleware/   auth, RBAC/ownership, validation, error handling
  validators/   Zod schemas per resource
  lib/          password hashing, JWT, JST date/time, Google/reCAPTCHA verification
  types/        shared TS types, Express Request augmentation
  generated/    Prisma Client output (gitignored — regenerate with `npx prisma generate`)
prisma/
  schema.prisma          the full data model
  migrations/             migration history
  seed.ts                 development fixtures
  migrate-admin-users.ts  one-time legacy admin_users -> users migration (already run)
```

See [`docs/API.md`](docs/API.md) for the full endpoint-by-endpoint reference, RBAC rules, and
request/response shapes.
