# Deploying to Vercel

**Production URL**: https://jdm-experience-backend-one.vercel.app/

The app is structured as a single Express app (`src/app.ts`) wrapped by a Vercel serverless
function entry point (`api/index.ts`). `vercel.json` rewrites every `/api/*` request to that one
function, so Express does its normal internal routing (currently just `GET /api/health`) — Vercel
just needs to get the request there.

`src/server.ts` (`app.listen(...)`) is for local dev only (`yarn dev`) and isn't used in the
Vercel deployment.

Prisma note: this project uses Prisma's driver-adapter mode (`@prisma/adapter-pg`), so there's no
native query-engine binary to worry about getting right for Vercel's Lambda OS — the usual
Prisma-on-Vercel `binaryTargets` headache doesn't apply here.

Swagger UI note: `/api/docs` serves static assets (`swagger-ui.css`, `swagger-ui-bundle.js`, ...)
via `express.static()` reading `node_modules/swagger-ui-dist` off disk at request time. Vercel's
function bundler only includes files it can trace from actual `import`/`require` statements — it
has no way to know a *runtime* filesystem lookup like that needs those files, so without help
they're silently missing from the deployed function, and `express.static` falls through to
Swagger UI's catch-all HTML handler for every asset request (same response body for the CSS, the
JS, and the docs page itself — a confusing failure mode if you don't know to look for it).
`vercel.json`'s `functions.includeFiles` forces Vercel to bundle the specific files Swagger UI's
HTML actually references (not the whole `swagger-ui-dist` package — it ships extra bundle
variants and source maps we don't need). If a future Swagger UI upgrade changes which files its
generated HTML links to, update that glob to match. This is also why the issue is invisible in
local dev (`yarn dev` reads the real filesystem directly,
bypassing Vercel's bundler entirely) — it only ever shows up on an actual deployment.

## One-time setup (do this in the Vercel dashboard — needs your account)

1. **Import the repo**: Vercel dashboard -> Add New -> Project -> import
   `JDM-experience/jdm_experience_backend` from GitHub. This is what wires up automatic
   deployments: pushes to `main` deploy to production, PRs get preview URLs, automatically.
2. **Framework preset**: none/other — this isn't Next.js. Build command and output can stay
   default/empty; Vercel builds `api/index.ts` as a serverless function on its own via
   `vercel.json`.
3. **Environment variables** (Project Settings -> Environment Variables) — Vercel lets you scope
   env vars per git branch, which maps directly onto our Supabase setup:
   - `main` branch -> Vercel Production deployment -> **PROD** Supabase project
   - `development` branch -> its Vercel deployment (scope these vars to that branch) -> **DEV**
     Supabase project — the same project `.env` already points to locally

   For each, set:
   - `DATABASE_URL` — that project's pooled Supabase connection string (port 6543,
     `pgbouncer=true`)
   - `DIRECT_URL` — that project's direct Supabase connection string (port 5432)
   - `CORS_ORIGIN` — Production: the deployed frontend's production URL. `development`: the
     frontend's corresponding deployment URL, or `localhost:5173` if there isn't one yet.
   - `NODE_ENV` — `production` for both (this is the Node runtime mode, unrelated to which
     Supabase project is in use)
   - Auth0 vars, once that integration exists (not yet — see `README.md`) — will likely need
     separate PROD/DEV Auth0 applications too

   Any other PR/preview branch that isn't `development` should also default to the DEV project's
   values (never PROD) — set those as the general Preview-environment fallback so a stray PR
   preview can't touch production data.

   None of these are committed to the repo (`.env` is gitignored); the dashboard is the only
   place they live for the deployed app.
4. **`yarn.lock` is the source of truth** — Vercel auto-detects Yarn from its presence. Don't
   let `package-lock.json` reappear (see `package.json`'s `preinstall` guard, which blocks
   `npm install`). Note: don't add a `packageManager` field to `package.json` — Vercel activates
   Corepack when it sees one, and that broke the build (`Cannot read properties of undefined
   (reading 'readFile')`) with this project's TypeScript version.

## Verifying a deployment

After the first deploy (and after any deploy you're unsure about):

```bash
curl -i https://jdm-experience-backend-one.vercel.app/api/health
# expect: HTTP 200, {"status":"ok"}
```

(Preview deployments get their own URL per branch/PR — swap in that URL to verify a preview instead.)

There's no deployed equivalent of `yarn db:test` yet (that script is dev-only, run locally
against `.env`) — the health check hitting 200 is the current signal that the deployed function
booted and Express is routing correctly. A DB-backed smoke check can be added to `/api/health`
later once there's a real query worth running on every request.

## Local development is unaffected

`yarn dev` still runs the plain Express server via `src/server.ts` — nothing about the Vercel
setup changes local dev.
