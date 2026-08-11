import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

// Postgres driver adapter for Supabase. Swapping to MySQL (e.g. Hostinger)
// means swapping this for @prisma/adapter-mariadb — see
// docs/DATABASE_MIGRATION.md.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })

export const prisma = new PrismaClient({ adapter })
