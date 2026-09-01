import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import swaggerUi from 'swagger-ui-express'
import { errorHandler, notFoundHandler } from './middleware/errorHandler'
import { openApiDocument } from './docs/openapi'
import routes from './routes'

const app = express()

app.use(helmet())
app.use(cors({ origin: process.env.CORS_ORIGIN }))
app.use(express.json())
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

// Root landing page — vercel.json rewrites "/" to this same function, same
// reason /api/* needs the rewrite: Vercel otherwise has nothing to route
// "/" to on the actual deployment.
app.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>jdm_experience_backend</title>
  </head>
  <body style="font-family: system-ui, sans-serif; max-width: 640px; margin: 4rem auto; line-height: 1.6;">
    <h1>jdm_experience_backend</h1>
    <p>Node.js/TypeScript REST API for the JDM Experience tour/reservation platform.</p>
    <p><a href="/api/docs/">API documentation</a> &middot; <a href="/api/health">health check</a></p>
  </body>
</html>`)
})

// swagger-ui-express has no built-in trailing-slash redirect: its HTML uses
// relative asset paths (./swagger-ui.css), which only resolve correctly when
// the browser's address bar already ends in "/docs/" — without the slash,
// "./swagger-ui.css" resolves to "/api/swagger-ui.css" (dropping "docs"),
// 404s, and Swagger UI fails to load. Force it before the mount below.
// A RegExp route (not a string pattern) is required here: Express's default
// loose routing treats string pattern '/api/docs' as matching '/api/docs/'
// too, which would redirect the already-correct URL right back to itself.
app.get(/^\/api\/docs$/, (_req, res) => {
  res.redirect(301, '/api/docs/')
})

// Under /api/* so vercel.json's rewrite routes it to this same function —
// anything outside /api/* 404s on the actual Vercel deployment. Relaxed CSP
// (script-src 'unsafe-inline') is required here: Swagger UI's HTML ships an
// inline bootstrap <script>, which the global helmet() CSP above would
// otherwise block in the browser — scoped to just this route, not the API.
app.use(
  '/api/docs',
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'", "'unsafe-inline'"],
      },
    },
  }),
  swaggerUi.serve,
  swaggerUi.setup(openApiDocument),
)

app.use('/api', routes)

app.use('/api', notFoundHandler)
app.use(errorHandler)

export default app
