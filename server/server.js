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
import { CATALOG_CATEGORIES, parseCatalogId, validateCatalogInput, validateCatalogQuery } from './catalogValidation.js'
import { parseItemId, validateItemChanges } from './cartValidation.js'
import { normalizeEmail, publicUser, validatePassword } from './authValidation.js'
import {
  createAuthRateLimiter,
  createSessionToken,
  expiredSessionCookie,
  hashSessionToken,
  readCookie,
  SESSION_TTL_MS,
  sessionCookie,
} from './authSecurity.js'

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
app.use(cors({ origin: allowedOrigins, credentials: true }))
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

const authRateLimit = createAuthRateLimiter()
const authMutation = [checkRequestOrigin, authRateLimit]

function validateCredentials(body, { registering = false } = {}) {
  const email = normalizeEmail(body?.email)
  const password = body?.password
  if (!email) return { error: 'Enter a valid email address' }
  if (!validatePassword(password, { registering })) {
    return { error: registering
      ? 'Password must be 8 to 72 UTF-8 bytes'
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
    request.user = user
    next()
  } catch (error) {
    next(error)
  }
}

app.post('/api/auth/register', ...authMutation, async (request, response, next) => {
  const credentials = validateCredentials(request.body ?? {}, { registering: true })
  if (credentials.error) return response.status(400).json({ error: credentials.error })
  try {
    const passwordHash = await bcrypt.hash(credentials.password, 12)
    const { token, tokenHash } = createSessionToken()
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
    const user = await authRepo.createAccount(pool, {
      email: credentials.email, passwordHash, sessionHash: tokenHash, expiresAt,
    })
    setSessionCookie(response, token)
    response.status(201).json({ user: publicUser(user) })
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error: 'An account with this email already exists' })
    next(error)
  }
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
    await authRepo.createSession(pool, {
      userId: existing.id,
      sessionHash: tokenHash,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    })
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
