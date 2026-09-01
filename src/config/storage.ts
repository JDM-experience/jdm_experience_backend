// Supabase Storage config + the one REST call we need from it: "create a signed upload URL".
// We talk to Storage over its REST API with the global `fetch` rather than pulling in
// @supabase/supabase-js — the runtime already uses Prisma's pg driver adapter for the database,
// and Storage only needs this single endpoint plus a URL template for public reads.

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set — required for file uploads (see .env.example).`)
  return value
}

export const storageConfig = {
  /** e.g. https://<project-ref>.supabase.co (no trailing slash). */
  get url(): string {
    return requireEnv('SUPABASE_URL').replace(/\/+$/, '')
  },
  /** Service-role key — server-only, bypasses RLS. Never sent to the browser. */
  get serviceRoleKey(): string {
    return requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  },
  /** Storage bucket for tour images. Must exist and be public-read (see .env.example). */
  get bucket(): string {
    return process.env.SUPABASE_STORAGE_BUCKET ?? 'tour-images'
  },
}

export interface SignedUpload {
  /** Storage object path, e.g. `tours/9f8e7d6c-....jpg`. */
  path: string
  /** Full URL the client PUTs the raw file bytes to. The `?token=` query param is the auth —
   *  no Authorization header needed on the upload. Single-use, short-lived. */
  signedUrl: string
  /** The same token, extracted — for clients using supabase-js `uploadToSignedUrl(path, token, file)`. */
  token: string
  /** CDN URL the file is served from once uploaded. This is the value stored on the tour. */
  publicUrl: string
}

/**
 * Asks Supabase Storage for a one-time signed URL the client can upload `objectPath` to directly.
 * Mirrors what supabase-js's `createSignedUploadUrl` does under the hood.
 */
export async function createSignedUploadUrl(objectPath: string): Promise<SignedUpload> {
  const base = storageConfig.url
  const bucket = storageConfig.bucket
  const endpoint = `${base}/storage/v1/object/upload/sign/${bucket}/${objectPath}`

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${storageConfig.serviceRoleKey}`,
      apikey: storageConfig.serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Supabase Storage sign request failed (${res.status}): ${detail || res.statusText}`)
  }

  const body = (await res.json()) as { url?: string }
  if (!body.url) throw new Error('Supabase Storage sign response did not include a URL.')

  // `body.url` looks like `/object/upload/sign/<bucket>/<path>?token=...` — tolerate an optional
  // leading slash or `/storage/v1` prefix in case the API shape ever shifts.
  const relative = body.url.replace(/^\/?(storage\/v1)?\/?/, '/')
  const signedUrl = new URL(`${base}/storage/v1${relative}`)
  const token = signedUrl.searchParams.get('token')
  if (!token) throw new Error('Supabase Storage sign response URL had no token.')

  return {
    path: objectPath,
    signedUrl: signedUrl.toString(),
    token,
    publicUrl: `${base}/storage/v1/object/public/${bucket}/${objectPath}`,
  }
}
