import { describe, expect, it } from 'vitest'
import { createBookingSchema } from './booking.validator'

const validBooking = () => ({
  tourId: 1,
  bookingDate: '2026-11-01',
  participants: 2,
  customerName: 'Example Customer',
  customerEmail: 'customer@example.com',
  customerPhone: '+81-90-1234-5678',
  paymentMethodId: 1,
  paymentProof: {
    fileUrl: 'https://files.example.com/proof.jpg',
    fileName: 'proof.jpg',
    fileType: 'image/jpeg',
  },
  policyConsents: {
    termsAccepted: true,
    privacyAcknowledged: true,
    termsVersion: 1,
    termsHash: 'a'.repeat(64),
    privacyVersion: 1,
    privacyHash: 'b'.repeat(64),
  },
})

describe('createBookingSchema policy acknowledgments', () => {
  it('accepts separate acknowledgments tied to both document versions', () => {
    expect(createBookingSchema.safeParse(validBooking()).success).toBe(true)
  })

  it('rejects a missing policy acknowledgment', () => {
    const { policyConsents: _policyConsents, ...booking } = validBooking()
    expect(createBookingSchema.safeParse(booking).success).toBe(false)
  })

  it('rejects either unchecked acknowledgment', () => {
    const input = validBooking()
    expect(
      createBookingSchema.safeParse({
        ...input,
        policyConsents: { ...input.policyConsents, termsAccepted: false },
      }).success,
    ).toBe(false)
    expect(
      createBookingSchema.safeParse({
        ...input,
        policyConsents: { ...input.policyConsents, privacyAcknowledged: false },
      }).success,
    ).toBe(false)
  })
})
