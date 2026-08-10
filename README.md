# jdm_experience_backend

Node.js/TypeScript REST API for the JDM Experience tour/reservation platform, with role-based
access control (SUPER_ADMIN/ADMIN/TOUR_GUIDE/CUSTOMER), MySQL via Prisma, JWT-in-cookie auth,
Google Sign-In, and reCAPTCHA verification. Full endpoint reference: [`docs/API.md`](docs/API.md).

The React frontend ([`jdm_experience_frontend`](https://github.com/achilleslucas79-bot/jdm_experience_frontend))
originally specified an earlier endpoint shape in its own `docs/BACKEND_REQUIREMENTS.md` — this
project implements the newer RBAC/tours/bookings architecture described in `docs/API.md` instead
(see that doc's intro for how the two relate).

## Setup

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL and any secrets you have
npx prisma generate
npm run dev
```

Server starts on `http://localhost:3000` (see `.env`). Health check: `GET /api/health`.

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
