import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

// Provider is Supabase Postgres. See docs/DATABASE_MIGRATION.md if this ever
// needs to move to a MySQL-only host.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // Direct (non-pooled) connection — Migrate needs this, not the pgbouncer
    // pooled URL, since transaction-mode pooling doesn't support the DDL/
    // prepared statements migrations require. Runtime queries use DATABASE_URL
    // via the driver adapter in src/config/prisma.ts instead.
    url: env('DIRECT_URL'),
  },
})
