# Migrating the database provider (e.g. Supabase Postgres -> Hostinger MySQL)

This project currently runs on Supabase Postgres (see `README.md` -> "Database (Prisma +
Supabase Postgres)"). This doc covers what's involved if we ever move to a different provider
that only offers MySQL — Hostinger being the concrete case that prompted this doc.

There are two separate concerns: changing the **schema/code** to target MySQL, and moving the
**existing data** across. Prisma helps a lot with the first; the second is on us.

## 1. Schema and code changes

These are the same four places we touched when we set up Supabase, just mirrored back to MySQL:

| File | Postgres (current) | MySQL |
|---|---|---|
| `prisma/schema.prisma` | `provider = "postgresql"` | `provider = "mysql"` |
| `package.json` | `@prisma/adapter-pg`, `pg` | `@prisma/adapter-mariadb`, `mariadb` (or `@prisma/adapter-mysql2` + `mysql2`) |
| `src/config/prisma.ts` | `PrismaPg` adapter | `PrismaMariaDb` (or equivalent) adapter, same shape |
| `.env` | `DATABASE_URL` (pooled) / `DIRECT_URL` (direct) | Hostinger typically gives one connection string — see note below |

```bash
npm uninstall @prisma/adapter-pg pg
npm install @prisma/adapter-mariadb mariadb
```

```prisma
// prisma/schema.prisma
datasource db {
  provider = "mysql"
}
```

```ts
// src/config/prisma.ts
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '../generated/prisma/client'

const adapter = new PrismaMariaDb({ connectionString: process.env.DATABASE_URL })
export const prisma = new PrismaClient({ adapter })
```

**Pooled vs. direct URL**: Hostinger's shared MySQL doesn't front the DB with a transaction
pooler like Supabase's pgbouncer, so there's usually just one connection string. In that case
`DATABASE_URL` and `DIRECT_URL` can point at the same value — keep both env vars for symmetry
with `prisma.config.ts`/`src/config/prisma.ts`, just set them equal.

**Watch for Postgres-specific schema features** — none of these exist in the schema yet, but if
they get added before a migration, they need rethinking for MySQL:
- `Json`/`Jsonb` fields — MySQL has `JSON` but no `Jsonb`, and indexing/query support differs.
- Native array fields (`String[]` etc.) — MySQL has no array type; needs a join table instead.
- `@db.Text`/enum-as-native-type choices — Prisma maps these per-provider; re-check after
  switching `provider`.
- Case sensitivity — MySQL string comparisons are case-insensitive by default (collation-
  dependent), Postgres is case-sensitive. Matters for anything comparing emails/usernames.

After changing the above: `npx prisma generate`, then `npx prisma db push` (or
`migrate deploy` if using tracked migrations) against the new MySQL database to create the
schema there — before moving any data.

## 2. Moving the data

Prisma doesn't move data between providers for you — only the schema/client. For a project this
size (a handful of tables), the simplest reliable approach is a **one-off dual-client script**
rather than a generic DB dump/restore tool, because it goes through Prisma's own type layer on
both ends instead of us hand-mapping Postgres types to MySQL types.

### Approach: dual Prisma Client script

1. Keep the old (Postgres) `PrismaClient` and a new (MySQL) `PrismaClient` both instantiated in
   one throwaway script (two separate connection configs, two separate generated clients or two
   `.env` files loaded manually).
2. Freeze writes to the old DB (maintenance window) so nothing changes mid-copy.
3. For each model, in FK-dependency order (parents before children — e.g. `User` before
   `Booking`), `findMany()` from the old client and `createMany()` into the new client. Chunk in
   batches (e.g. 500 rows) for large tables.
4. After all tables are copied, compare row counts per table between old and new as a sanity
   check.
5. Point `DATABASE_URL`/`DIRECT_URL` at the new MySQL database, redeploy, smoke-test
   (`npm run db:test` plus a few real endpoints), then decommission the old database.

This repo doesn't have this script yet since there's no real data to migrate — add it under
`prisma/migrate-provider.ts` (throwaway, not committed to run in CI) when an actual cutover is
scheduled, modeled on `prisma/test-connection.ts`.

### When the dual-client approach stops being enough

If the dataset grows large (hundreds of thousands of rows+) or downtime needs to be near-zero,
a dedicated migration tool (e.g. AWS DMS, or a change-data-capture pipeline) becomes worth the
setup cost instead of a synchronous script. Not a concern at this project's current scale.

### Rollback

Keep the old database (Supabase) intact and untouched until the new one (MySQL) is verified in
production for a few days. Rolling back is just pointing `DATABASE_URL`/`DIRECT_URL` back.
