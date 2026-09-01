import type { Role } from '../generated/prisma/client'

/** The `users` shape ever sent to clients. */
export interface PublicUser {
  id: number
  fullName: string | null
  email: string
  username: string | null
  role: Role
  authProvider: 'AUTH0'
  isActive: boolean
  createdAt: string
}

// Auth0 is the sole identity provider this backend has ever supported -- no schema column for
// it, so authProvider is always 'AUTH0' regardless of whether the row has logged in yet.
export function toPublicUser(row: {
  userId: number
  fullName: string | null
  email: string
  username: string | null
  role: Role
  isActive: boolean
  createdAt: Date
}): PublicUser {
  return {
    id: row.userId,
    fullName: row.fullName,
    email: row.email,
    username: row.username,
    role: row.role,
    authProvider: 'AUTH0',
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  }
}
