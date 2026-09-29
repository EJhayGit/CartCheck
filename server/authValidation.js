const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmail(value) {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  if (email.length < 3 || email.length > 320 || !EMAIL_PATTERN.test(email)) return null
  return email
}

export function validatePassword(value, { registering = false } = {}) {
  if (typeof value !== 'string') return false
  const bytes = Buffer.byteLength(value, 'utf8')
  return bytes > 0 && bytes <= 72 && (!registering || value.length >= 8)
}

export function publicUser(row) {
  const emailVerified = row.email_verified === true
  const legacyExempt = row.legacy_verification_exempt === true
  const enforcementEnabled = process.env.REQUIRE_VERIFIED_EMAIL === 'true'
  return {
    id: String(row.id),
    email: row.email,
    preferred_currency: row.preferred_currency,
    email_verified: emailVerified,
    verification_required: enforcementEnabled && !emailVerified && !legacyExempt,
  }
}
