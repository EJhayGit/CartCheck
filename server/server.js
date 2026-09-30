import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import bcrypt from 'bcryptjs'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from './db/pool.js'
import * as authRepo from './authRepo.js'
import * as catalogRepo from './catalogRepo.js'
import * as cartRepo from './cartRepo.js'
import * as tripRepo from './tripRepo.js'
import { CATALOG_CATEGORIES, parseCatalogId, validateCatalogInput, validateCatalogQuery } from './catalogValidation.js'
import {
  parseItemId,
  validateCartChanges,
  validateCurrencyChanges,
  validateItemChanges,
} from './cartValidation.js'
import {
  isAuthStatusEndpoint,
  normalizeEmail,
  publicUser,
  requiresEmailVerification,
  validatePassword,
} from './authValidation.js'
import { parseTripId, validateCorrection, validateHistoryQuery, validateRevision } from './tripValidation.js'
import {
  createAuthRateLimiter,
  createActionToken,
  createSessionToken,
  expiredSessionCookie,
  hashSessionToken,
  readCookie,
  SESSION_TTL_MS,
  sessionCookie,
} from './authSecurity.js'
import { sendAccountEmail } from './emailService.js'
import { accountActionUrl } from './accountLinks.js'

const app = express()
app.set('trust proxy', 1)
const DUMMY_PASSWORD_HASH = '$2b$12$xptoLy.PbkOgrqREcktMpum2TPLPLVKmXVGXUqCvYrRC6mWkwDbfS'
const clientDist = resolve(dirname(fileURLToPath(import.meta.url)), '../client/dist')
const clientIndex = resolve(clientDist, 'index.html')
const hasClientBuild = existsSync(clientIndex)
const serveClientAssets = express.static(clientDist, { index: false })

// CORS before the routes. Middleware registered after a route never sees that
// route's requests, which is the m4 lesson showing up in production.
//
// Name your origins. app.use(cors()) with no options sends
// Access-Control-Allow-Origin: *, which lets any site on the internet call this
// API from a visitor's browser, and is incompatible with cookies.
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

app.use(helmet())
app.use(cors({ origin: allowedOrigins, credentials: true, exposedHeaders: ['Retry-After'] }))
app.use(express.json({ limit: '100kb' }))

function checkRequestOrigin(request, response, next) {
  const origin = request.get('Origin')
  if (!origin || origin === 'null') {
    return response.status(403).json({ error: 'Request origin is required' })
  }
  let sameOrigin = false
  try {
    const parsedOrigin = new URL(origin)
    const expectedProtocol = process.env.NODE_ENV === 'production' ? 'https:' : `${request.protocol}:`
    sameOrigin = parsedOrigin.host === request.get('host') && parsedOrigin.protocol === expectedProtocol
  } catch {
    sameOrigin = false
  }
  if (origin && !allowedOrigins.includes(origin) && !sameOrigin) {
    return response.status(403).json({ error: 'Request origin is not allowed' })
  }
  next()
}

// Guarded integration exercises many account actions from one loopback IP.
// Keep the production limiter unchanged while testing the persistent
// per-account email cooldown independently.
const authRateLimit = createAuthRateLimiter({ limit: process.env.NODE_ENV === 'test' ? 100 : 10 })
const authMutation = [checkRequestOrigin, authRateLimit]

function validateCredentials(body, { creatingAccount = false } = {}) {
  const email = normalizeEmail(body?.email)
  const password = body?.password
  if (!email) return { error: 'Enter a valid email address' }
  if (!validatePassword(password, { creating: creatingAccount })) {
    return { error: creatingAccount
      ? 'Password must contain at least 8 characters and no more than 72 UTF-8 bytes'
      : 'Enter a valid password' }
  }
  return { email, password }
}

function setSessionCookie(response, token) {
  response.set('Set-Cookie', sessionCookie(token))
}

async function authenticate(request, response, next) {
  const token = readCookie(request)
  if (!token) return response.status(401).json({ error: 'Authentication required' })
  try {
    const user = await authRepo.findUserBySessionHash(pool, hashSessionToken(token))
    if (!user) return response.status(401).json({ error: 'Authentication required' })
    if (requiresEmailVerification(user) && !isAuthStatusEndpoint(request.path)) {
      return response.status(403).json({ error: 'Verify your email address to continue', code: 'EMAIL_VERIFICATION_REQUIRED' })
    }
    request.user = user
    next()
  } catch (error) {
    next(error)
  }
}

const genericAccountMessage = 'If the account is eligible, instructions will be sent.'
const actionTokenPattern = /^[A-Za-z0-9_-]{43}$/

async function issueAndSendAccountToken(user, purpose) {
  const { token, tokenHash } = createActionToken()
  const issued = await authRepo.issueAccountToken(pool, { userId: user.id, purpose, tokenHash })
  if (!issued) return
  try {
    await sendAccountEmail({ to: user.email, kind: purpose,
      actionUrl: accountActionUrl(purpose, token, { fallbackOrigin: allowedOrigins[0] }) })
  } catch {
    try { await authRepo.discardAccountToken(pool, tokenHash) } catch { /* keep logs free of token data */ }
    // Provider details, recipient, and token are intentionally omitted.
    console.error('Account email delivery failed')
    return
  }
  try { await authRepo.finalizeAccountToken(pool, { userId: user.id, purpose, tokenHash }) }
  catch { console.error('Account email token finalization failed') }
}

app.post('/api/auth/register', ...authMutation, async (request, response, next) => {
  const credentials = validateCredentials(request.body ?? {}, { creatingAccount: true })
  if (credentials.error) return response.status(400).json({ error: credentials.error })
  try {
    const passwordHash = await bcrypt.hash(credentials.password, 12)
    const { token, tokenHash } = createSessionToken()
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
    const user = await authRepo.createAccount(pool, {
      email: credentials.email, passwordHash, sessionHash: tokenHash, expiresAt,
    })
    await issueAndSendAccountToken(user, 'verify_email')
    setSessionCookie(response, token)
    response.status(201).json({ user: publicUser(user) })
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error: 'An account with this email already exists' })
    next(error)
  }
})

app.post('/api/auth/resend-verification', ...authMutation, async (request, response, next) => {
  const email = normalizeEmail(request.body?.email)
  try {
    const user = email ? await authRepo.findUserByEmail(pool, email) : null
    response.status(202).json({ message: genericAccountMessage })
    // Provider latency must not distinguish an eligible address from another.
    if (user && !user.email_verified) {
      void issueAndSendAccountToken(user, 'verify_email')
        .catch(() => console.error('Account email request failed'))
    }
  } catch (error) { next(error) }
})

app.post('/api/auth/verify-email', ...authMutation, async (request, response, next) => {
  const token = request.body?.token
  if (typeof token !== 'string' || !actionTokenPattern.test(token)) {
    return response.status(400).json({ error: 'Verification link is invalid or expired' })
  }
  try {
    const user = await authRepo.verifyAccountEmail(pool, hashSessionToken(token))
    if (!user) return response.status(400).json({ error: 'Verification link is invalid or expired' })
    response.json({ verified: true, user: publicUser(user) })
  } catch (error) { next(error) }
})

app.post('/api/auth/forgot-password', ...authMutation, async (request, response, next) => {
  const email = normalizeEmail(request.body?.email)
  try {
    const user = email ? await authRepo.findUserByEmail(pool, email) : null
    response.status(202).json({ message: genericAccountMessage })
    if (user) {
      void issueAndSendAccountToken(user, 'reset_password')
        .catch(() => console.error('Account email request failed'))
    }
  } catch (error) { next(error) }
})

app.post('/api/auth/reset-password', ...authMutation, async (request, response, next) => {
  const { token, password } = request.body ?? {}
  if (typeof token !== 'string' || !actionTokenPattern.test(token)) {
    return response.status(400).json({ error: 'Reset link is invalid or expired' })
  }
  if (!validatePassword(password, { creating: true })) {
    return response.status(400).json({ error: 'Password must contain at least 8 characters and no more than 72 UTF-8 bytes' })
  }
  try {
    const passwordHash = await bcrypt.hash(password, 12)
    const changed = await authRepo.resetPasswordWithToken(pool, { tokenHash: hashSessionToken(token), passwordHash })
    if (!changed) return response.status(400).json({ error: 'Reset link is invalid or expired' })
    response.json({ message: 'Password updated successfully.' })
  } catch (error) { next(error) }
})

app.post('/api/auth/change-password', checkRequestOrigin, authRateLimit, authenticate, async (request, response, next) => {
  const { currentPassword, newPassword } = request.body ?? {}
  if (!validatePassword(currentPassword) || !validatePassword(newPassword, { creating: true })) {
    return response.status(400).json({ error: 'Enter a valid current password and a new password of at least 8 characters and no more than 72 UTF-8 bytes' })
  }
  try {
    const account = await authRepo.findUserByEmail(pool, request.user.email)
    if (!account || !await bcrypt.compare(currentPassword, account.password_hash)) {
      return response.status(400).json({ error: 'Current password is incorrect' })
    }
    const passwordHash = await bcrypt.hash(newPassword, 12)
    const changed = await authRepo.changePasswordAndRevokeSessions(pool, {
      userId: request.user.id, currentPasswordHash: account.password_hash, passwordHash,
    })
    if (!changed) return response.status(400).json({ error: 'Current password is incorrect' })
    response.set('Set-Cookie', expiredSessionCookie()).json({ message: 'Password updated successfully.' })
  } catch (error) { next(error) }
})

app.post('/api/auth/login', ...authMutation, async (request, response, next) => {
  const credentials = validateCredentials(request.body ?? {})
  if (credentials.error) return response.status(400).json({ error: 'Enter a valid email and password' })
  try {
    const existing = await authRepo.findUserByEmail(pool, credentials.email)
    const valid = existing
      ? await bcrypt.compare(credentials.password, existing.password_hash)
      : await bcrypt.compare(credentials.password, DUMMY_PASSWORD_HASH)
    if (!existing || !valid) return response.status(401).json({ error: 'Invalid email or password' })
    const { token, tokenHash } = createSessionToken()
    const sessionCreated = await authRepo.createSessionForPasswordHash(pool, {
      userId: existing.id,
      passwordHash: existing.password_hash,
      sessionHash: tokenHash,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    })
    if (!sessionCreated) return response.status(401).json({ error: 'Invalid email or password' })
    setSessionCookie(response, token)
    response.json({ user: publicUser(existing) })
  } catch (error) {
    next(error)
  }
})

app.get('/api/auth/me', authenticate, (request, response) => {
  response.json({ user: publicUser(request.user) })
})

// Kept as an alias for the approved API design's session restoration path.
app.get('/api/auth/session', authenticate, (request, response) => {
  response.json({ user: publicUser(request.user) })
})

app.patch('/api/me/settings', checkRequestOrigin, authenticate, async (request, response, next) => {
  const changes = validateCurrencyChanges(request.body)
  if (changes.error) return response.status(400).json({ error: changes.error })
  try {
    const preferredCurrency = await cartRepo.updatePreferredCurrency(pool, request.user.id, changes.preferredCurrency)
    if (!preferredCurrency) return response.status(404).json({ error: 'Account not found' })
    response.json({ preferredCurrency })
  } catch (error) { next(error) }
})

app.post('/api/auth/logout', checkRequestOrigin, async (request, response, next) => {
  const token = readCookie(request)
  try {
    if (token) await authRepo.revokeSession(pool, hashSessionToken(token))
    response.set('Set-Cookie', expiredSessionCookie()).status(204).end()
  } catch (error) {
    next(error)
  }
})

app.get('/api/catalog', authenticate, async (request, response, next) => {
  const filters = validateCatalogQuery(request.query)
  if (filters.error) return response.status(400).json({ error: filters.error })
  try {
    const items = await catalogRepo.listCatalog(pool, request.user.id, filters)
    response.json({ items, categories: CATALOG_CATEGORIES })
  } catch (error) {
    next(error)
  }
})

app.post('/api/catalog', checkRequestOrigin, authenticate, async (request, response, next) => {
  const input = validateCatalogInput(request.body)
  if (input.error) return response.status(400).json({ error: input.error })
  try {
    const item = await catalogRepo.createCatalogItem(pool, request.user.id, input)
    response.status(201).json({ item })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/catalog/:id', checkRequestOrigin, authenticate, async (request, response, next) => {
  const id = parseCatalogId(request.params.id)
  if (id === null) return response.status(400).json({ error: 'Invalid catalog item id' })
  const changes = validateCatalogInput(request.body, { partial: true })
  if (changes.error) return response.status(400).json({ error: changes.error })
  try {
    const item = await catalogRepo.updateCatalogItem(pool, request.user.id, id, changes)
    if (!item) return response.status(404).json({ error: 'Catalog item not found' })
    response.json({ item })
  } catch (error) {
    next(error)
  }
})

app.delete('/api/catalog/:id', checkRequestOrigin, authenticate, async (request, response, next) => {
  const id = parseCatalogId(request.params.id)
  if (id === null) return response.status(400).json({ error: 'Invalid catalog item id' })
  try {
    const deleted = await catalogRepo.deleteCatalogItem(pool, request.user.id, id)
    if (!deleted) return response.status(404).json({ error: 'Catalog item not found' })
    response.status(204).end()
  } catch (error) {
    if (error.code === '23503') return response.status(409).json({ error: 'This item is used by a shopping trip and cannot be deleted' })
    next(error)
  }
})

app.get('/api/cart', authenticate, async (request, response, next) => {
  try { response.json(await cartRepo.getCart(pool, request.user.id)) }
  catch (error) { next(error) }
})

app.patch('/api/cart', checkRequestOrigin, authenticate, async (request, response, next) => {
  const changes = validateCartChanges(request.body)
  if (changes.error) return response.status(400).json({ error: changes.error })
  try {
    const cart = await cartRepo.updateActiveBudget(pool, request.user.id, changes.budget)
    if (!cart) return response.status(404).json({ error: 'Active trip not found' })
    response.json({ budget: cart.budget, currency: cart.currency })
  } catch (error) { next(error) }
})

app.post('/api/cart/items', checkRequestOrigin, authenticate, async (request, response, next) => {
  const body = request.body
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !Object.hasOwn(body, 'productId')) {
    return response.status(400).json({ error: 'Provide a catalog product ID' })
  }
  if (typeof body.productId !== 'string' && typeof body.productId !== 'number') {
    return response.status(400).json({ error: 'Invalid catalog product ID' })
  }
  const productId = parseCatalogId(String(body.productId))
  if (productId === null) return response.status(400).json({ error: 'Invalid catalog product ID' })
  try {
    const result = await cartRepo.addCatalogItem(pool, request.user.id, productId)
    if (!result) return response.status(404).json({ error: 'Catalog item not found' })
    response.status(result.created ? 201 : 200).json(result)
  } catch (error) { next(error) }
})

app.patch('/api/cart/items/:id', checkRequestOrigin, authenticate, async (request, response, next) => {
  const id = parseItemId(request.params.id)
  if (id === null) return response.status(400).json({ error: 'Invalid list item ID' })
  const changes = validateItemChanges(request.body)
  if (changes.error) return response.status(400).json({ error: changes.error })
  try {
    const item = await cartRepo.updateItem(pool, request.user.id, id, changes)
    if (!item) return response.status(404).json({ error: 'List item not found' })
    response.json({ item })
  } catch (error) { next(error) }
})

app.delete('/api/cart/items/:id', checkRequestOrigin, authenticate, async (request, response, next) => {
  const id = parseItemId(request.params.id)
  if (id === null) return response.status(400).json({ error: 'Invalid list item ID' })
  try {
    if (!await cartRepo.deleteItem(pool, request.user.id, id)) {
      return response.status(404).json({ error: 'List item not found' })
    }
    response.status(204).end()
  } catch (error) { next(error) }
})

app.post('/api/trips/:id/finish', checkRequestOrigin, authenticate, async (request, response, next) => {
  const id = parseTripId(request.params.id)
  if (id === null) return response.status(400).json({ error: 'Invalid trip ID' })
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body) ||
      Object.keys(request.body).length !== 1 || !Object.hasOwn(request.body, 'revision')) {
    return response.status(400).json({ error: 'Provide the reviewed trip revision' })
  }
  const revision = validateRevision(request.body.revision)
  if (revision.error) return response.status(400).json({ error: revision.error })
  try {
    const result = await tripRepo.finishTrip(pool, request.user.id, id, revision.revision)
    if (result.error === 'not_found') return response.status(404).json({ error: 'Trip not found' })
    if (result.error === 'stale') return response.status(409).json({ error: 'Trip changed; reload it before finishing' })
    if (result.error === 'empty') return response.status(400).json({ error: 'An empty trip cannot be finished' })
    response.json(result)
  } catch (error) { next(error) }
})

app.get('/api/trips', authenticate, async (request, response, next) => {
  const query = validateHistoryQuery(request.query)
  if (query.error) return response.status(400).json({ error: query.error })
  try { response.json(await tripRepo.listTrips(pool, request.user.id, query)) }
  catch (error) { next(error) }
})

app.get('/api/trips/:id', authenticate, async (request, response, next) => {
  const id = parseTripId(request.params.id)
  if (id === null) return response.status(400).json({ error: 'Invalid trip ID' })
  try {
    const trip = await tripRepo.getTrip(pool, request.user.id, id)
    if (!trip) return response.status(404).json({ error: 'Trip not found' })
    response.json({ trip })
  } catch (error) { next(error) }
})

app.put('/api/trips/:id', checkRequestOrigin, authenticate, async (request, response, next) => {
  const id = parseTripId(request.params.id)
  if (id === null) return response.status(400).json({ error: 'Invalid trip ID' })
  const correction = validateCorrection(request.body)
  if (correction.error) return response.status(400).json({ error: correction.error })
  try {
    const result = await tripRepo.correctTrip(pool, request.user.id, id, correction.revision, correction.items)
    if (result.error === 'not_found') return response.status(404).json({ error: 'Completed trip not found' })
    if (result.error === 'stale') return response.status(409).json({ error: 'Trip changed; reload it before saving corrections' })
    if (result.error === 'invalid_item') return response.status(400).json({ error: 'Correction includes an item outside this trip' })
    response.json(result)
  } catch (error) {
    if (error.code === '23505') return response.status(400).json({ error: 'A trip cannot contain the same catalog item twice' })
    if (error.code === '23503') return response.status(400).json({ error: 'Catalog product is not available to this account' })
    next(error)
  }
})

// Is the process alive?
app.get('/healthz', (request, response) => {
  response.json({ ok: true })
})

// Is the database reachable? A different question, and the one that tells you
// in two seconds which half of a problem you have.
app.get('/readyz', async (request, response) => {
  try {
    await pool.query('SELECT 1')
    response.json({ ok: true, db: 'up' })
  } catch (error) {
    console.error('readyz failed:', error.message)
    response.status(503).json({ ok: false, db: 'down' })
  }
})

app.use((request, response, next) => {
  if (request.path === '/api' || request.path.startsWith('/api/')) return next()
  serveClientAssets(request, response, next)
})

app.use((request, response) => {
  if (request.path === '/api' || request.path.startsWith('/api/')) {
    return response.status(404).json({ error: 'No such route' })
  }
  if (hasClientBuild && ['GET', 'HEAD'].includes(request.method)) {
    return response.sendFile(clientIndex)
  }
  response.status(404).json({ error: 'No such route' })
})

// The detail goes in your logs; the visitor gets a plain message. Sending a
// stack trace to a stranger tells them about your file layout and dependencies.
app.use((error, request, response, next) => {
  const isMalformedJson = error?.type === 'entity.parse.failed'
  console.error('API request failed', {
    type: error?.type || 'internal_error',
    code: error?.code || 'internal_error',
  })
  if (isMalformedJson) return response.status(400).json({ error: 'Invalid JSON body' })
  response.status(500).json({ error: 'Something went wrong on the server' })
})

// The host chooses the port and tells you through PORT. Hardcoding 3000 is the
// commonest reason a first deploy is marked unhealthy and killed.
const port = process.env.PORT || 3000

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`)
  console.log(`CORS allows: ${allowedOrigins.join(', ')}`)
})
