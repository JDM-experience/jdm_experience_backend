import { prisma } from '../config/prisma'
import { ApiError } from '../middleware/errorHandler'
import { recordAuditLog } from './auditLog.service'
import type { ContactMessageStatus, Role } from '../generated/prisma/client'

type Actor = { userId: number; role: Role }

function toPublicMessage(m: {
  id: number
  name: string | null
  email: string | null
  subject: string | null
  message: string | null
  status: ContactMessageStatus
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: m.id,
    name: m.name,
    email: m.email,
    subject: m.subject,
    message: m.message,
    status: m.status,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  }
}

export async function submitMessage(input: { name: string; email: string; subject?: string; message: string }) {
  const created = await prisma.contactMessage.create({
    data: { name: input.name, email: input.email, subject: input.subject, message: input.message },
  })
  return toPublicMessage(created)
}

export async function listMessages() {
  const rows = await prisma.contactMessage.findMany({ orderBy: { createdAt: 'desc' } })
  return rows.map(toPublicMessage)
}

export async function getMessage(id: number) {
  const row = await prisma.contactMessage.findUnique({ where: { id } })
  if (!row) throw new ApiError(404, 'Contact message not found.')
  return toPublicMessage(row)
}

export async function updateMessageStatus(actor: Actor, id: number, status: ContactMessageStatus) {
  const existing = await prisma.contactMessage.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Contact message not found.')

  const updated = await prisma.contactMessage.update({ where: { id }, data: { status } })
  await recordAuditLog({
    userId: actor.userId,
    action: 'contact_message.status_update',
    entity: 'contact_messages',
    entityId: id,
    metadata: { status },
  })
  return toPublicMessage(updated)
}

export async function deleteMessage(actor: Actor, id: number): Promise<void> {
  const existing = await prisma.contactMessage.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Contact message not found.')

  await prisma.contactMessage.delete({ where: { id } })
  await recordAuditLog({ userId: actor.userId, action: 'contact_message.delete', entity: 'contact_messages', entityId: id })
}
