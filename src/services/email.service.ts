import nodemailer, { type Transporter } from 'nodemailer'

/**
 * Centralized outbound email. Configured entirely from env vars (see .env.example) — never
 * hardcode credentials or recipients. Fails lazily and gracefully: if EMAIL_* isn't configured
 * (or the send itself fails), we log and return rather than throwing, so a broken/unconfigured
 * mail server never blocks the underlying booking/payment action that triggered the email. Same
 * pattern as storage.ts's lazy Supabase config check.
 */

let cachedTransporter: Transporter | null | undefined

function getTransporter(): Transporter | null {
  if (cachedTransporter !== undefined) return cachedTransporter

  const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASSWORD } = process.env
  if (!EMAIL_HOST || !EMAIL_PORT || !EMAIL_USER || !EMAIL_PASSWORD) {
    console.warn('[email] EMAIL_HOST/EMAIL_PORT/EMAIL_USER/EMAIL_PASSWORD not fully set — emails will be logged, not sent.')
    cachedTransporter = null
    return null
  }

  cachedTransporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: Number(EMAIL_PORT),
    secure: Number(EMAIL_PORT) === 465,
    auth: { user: EMAIL_USER, pass: EMAIL_PASSWORD },
  })
  return cachedTransporter
}

async function sendEmail(input: { to: string; subject: string; text: string; html?: string }): Promise<void> {
  const transporter = getTransporter()
  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@jdmexperience.dev'

  if (!transporter) {
    console.info(`[email] (not sent — unconfigured) To: ${input.to} | Subject: ${input.subject}\n${input.text}`)
    return
  }

  try {
    await transporter.sendMail({ from, to: input.to, subject: input.subject, text: input.text, html: input.html })
  } catch (error) {
    // Never let an email failure break the booking/payment flow that triggered it.
    console.error(`[email] Failed to send "${input.subject}" to ${input.to}:`, error)
  }
}

interface PaymentProofNotification {
  recipients: string[]
  bookingId: number
  tourName: string
  bookingDate: string
  customerName: string
  customerEmail: string
  paymentMethodName: string | null
  proofUrl: string
  submittedAt: string
  status: string
}

export async function sendPaymentProofSubmittedEmail(input: PaymentProofNotification): Promise<void> {
  const subject = `Payment proof submitted — Booking JDM-${input.bookingId}`
  const text = [
    `Payment proof was submitted for a booking.`,
    ``,
    `Booking Reference: JDM-${input.bookingId}`,
    `Tour: ${input.tourName}`,
    `Booking Date: ${input.bookingDate}`,
    `Customer: ${input.customerName} (${input.customerEmail})`,
    `Payment Method: ${input.paymentMethodName ?? 'Not specified'}`,
    `Submitted: ${input.submittedAt}`,
    `Status: ${input.status}`,
    `Payment Proof: ${input.proofUrl}`,
  ].join('\n')

  await Promise.all(input.recipients.map((to) => sendEmail({ to, subject, text })))
}

interface BookingConfirmedNotification {
  to: string
  customerName: string
  tourName: string
  bookingDate: string
  bookingId: number
  paymentMethodName: string | null
  status: string
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
}

export async function sendBookingConfirmedEmail(input: BookingConfirmedNotification): Promise<void> {
  const subject = 'Your JDM Experience Booking Has Been Confirmed'
  const text = [
    `Hello ${input.customerName},`,
    ``,
    `Your booking has been confirmed.`,
    ``,
    `Tour: ${input.tourName}`,
    `Date: ${input.bookingDate}`,
    `Booking Reference: JDM-${input.bookingId}`,
    `Payment Method: ${input.paymentMethodName ?? 'Not specified'}`,
    `Status: ${input.status}`,
    ``,
    `Tour Contact:`,
    input.contactName ? `${input.contactName}` : '(not set)',
    input.contactEmail ? `Email: ${input.contactEmail}` : '',
    input.contactPhone ? `Phone: ${input.contactPhone}` : '',
    ``,
    `Thank you.`,
  ]
    .filter((line) => line !== '')
    .join('\n')

  await sendEmail({ to: input.to, subject, text })
}
