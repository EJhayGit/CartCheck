import { createHash, randomBytes } from 'node:crypto'

export const SESSION_COOKIE = 'cartcheck_session'
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const ACCOUNT_TOKEN_TTL_MINUTES = 30

export function createSessionToken() {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashSessionToken(token) }
}

// Email action tokens are independent of login sessions. Keep only their
// SHA-256 digest in PostgreSQL; the 256-bit random value is returned once.
export function createActionToken() {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashSessionToken(token) }
}

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

export function readCookie(request, cookieName = SESSION_COOKIE) {
  const header = request.headers.cookie
  if (typeof header !== 'string') return null
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0 || part.slice(0, separator).trim() !== cookieName) continue
    const value = part.slice(separator + 1).trim()
    return /^[A-Za-z0-9_-]{40,}$/.test(value) ? value : null
  }
  return null
}

export function sessionCookie(token, { production = process.env.NODE_ENV === 'production' } = {}) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${production ? '; Secure' : ''}`
}

export function expiredSessionCookie({ production = process.env.NODE_ENV === 'production' } = {}) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${production ? '; Secure' : ''}`
}

export function createAuthRateLimiter({ limit = 10, windowMs = 15 * 60 * 1000, now = Date.now } = {}) {
  const clients = new Map()
  return (request, response, next) => {
    const time = now()
    for (const [key, bucket] of clients) if (bucket.resetAt <= time) clients.delete(key)
    const key = request.ip || request.socket?.remoteAddress || 'unknown'
    let bucket = clients.get(key)
    if (!bucket || bucket.resetAt <= time) {
      bucket = { count: 0, resetAt: time + windowMs }
      clients.set(key, bucket)
    }
    if (clients.size > 5000) clients.delete(clients.keys().next().value)
    bucket.count++
    if (bucket.count > limit) {
      response.set('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - time) / 1000))))
      return response.status(429).json({ error: 'Too many account requests. Try again later.' })
    }
    next()
  }
}
