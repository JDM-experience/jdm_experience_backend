import 'dotenv/config'
import { prisma } from '../src/config/prisma'

async function main() {
  const [{ now }] = await prisma.$queryRaw<{ now: Date }[]>`SELECT NOW() as now`
  console.log(`Raw query OK — DB time: ${now.toISOString()}`)

  const row = await prisma.healthCheck.create({ data: {} })
  console.log(`Model create OK — inserted HealthCheck#${row.id}`)

  const count = await prisma.healthCheck.count()
  console.log(`Model query OK — ${count} HealthCheck row(s) total`)
}

main()
  .then(() => {
    console.log('Prisma <-> Supabase Postgres connection verified.')
  })
  .catch((err) => {
    console.error('Database test failed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
