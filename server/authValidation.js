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
  return {
    id: String(row.id),
    email: row.email,
    preferred_currency: row.preferred_currency,
  }
}
