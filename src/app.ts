import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import { z } from 'zod'
import { prisma } from './config/prisma'

const app = express()

app.use(helmet())
app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }))
app.use(cookieParser())
app.use(express.json())
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

const loginSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  age: z.number().int().positive(),
})

// Placeholder until Auth0 is wired up — for now just records basic client
// info on "login" so the DB round trip is exercised end to end.
app.post('/api/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const { first_name, last_name, age } = parsed.data
  const client = await prisma.client.create({
    data: { firstName: first_name, lastName: last_name, age },
  })

  res.json({ status: 'ok', client })
})

export default app
