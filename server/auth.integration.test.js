import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { hashSessionToken, SESSION_COOKIE } from './authSecurity.js'
import { poolConfig } from './db/config.js'
import { assertUnusedTestEmails, cleanupTestEmails, testEmails } from './testDatabaseSafety.js'

const runId = process.env.CARTCHECK_TEST_RUN_ID
const databaseUrl = runId && process.env.CARTCHECK_TEST_DATABASE_URL

async function unusedPort() {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function waitForServer(baseUrl, child, output) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`API exited before becoming ready: ${output()}`)
    try {
      const response = await fetch(`${baseUrl}/readyz`)
      if (response.ok) return
    } catch {
      // The child has not bound its port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`API did not become ready: ${output()}`)
}

function cookiePair(response) {
  const value = response.headers.get('set-cookie')
  assert.ok(value, 'authentication response should set a session cookie')
  return value.split(';', 1)[0]
}

async function jsonRequest(baseUrl, path, {
  method = 'GET', body, cookie,
  origin = method === 'GET' ? undefined : 'http://localhost:5173',
} = {}) {
  const headers = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (cookie) headers.cookie = cookie
  if (origin) headers.origin = origin
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

test('account lifecycle, session security, and initial private data isolation', {
  skip: !databaseUrl && 'Use the guarded testIntegrationDev.js runner for database API tests',
}, async (t) => {
  const client = new pg.Client(poolConfig({ ...process.env, DATABASE_URL: databaseUrl }))
  await client.connect()
  const [emailA, emailB] = testEmails(runId)
  await assertUnusedTestEmails(client, [emailA, emailB])
  const suffix = runId
  const passwordA = `Milestone2-${randomUUID()}!`
  const passwordB = `Milestone2-${randomUUID()}!`
  const port = await unusedPort()
  const baseUrl = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('.', import.meta.url),
    env: { ...process.env, DATABASE_URL: databaseUrl, PORT: String(port), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  child.stdout.setEncoding('utf8').on('data', (chunk) => { logs += chunk })
  child.stderr.setEncoding('utf8').on('data', (chunk) => { logs += chunk })
  t.after(async () => {
    child.kill()
    if (child.exitCode === null) await once(child, 'exit')
    try { await cleanupTestEmails(client, [emailA, emailB]) }
    finally { await client.end() }
  })

  try {
    await waitForServer(baseUrl, child, () => logs)

    const unauthenticated = await jsonRequest(baseUrl, '/api/auth/me')
    assert.equal(unauthenticated.status, 401)
    assert.deepEqual(await unauthenticated.json(), { error: 'Authentication required' })

    const missingOrigin = await jsonRequest(baseUrl, '/api/auth/register', {
      method: 'POST', origin: null, body: { email: emailA, password: passwordA },
    })
    assert.equal(missingOrigin.status, 403, 'auth mutations should reject requests without an Origin')
    const disallowedOrigin = await jsonRequest(baseUrl, '/api/auth/register', {
      method: 'POST', origin: 'https://attacker.example', body: { email: emailA, password: passwordA },
    })
    assert.equal(disallowedOrigin.status, 403, 'auth mutations should reject unapproved origins')

    const registration = await jsonRequest(baseUrl, '/api/auth/register', {
      method: 'POST', body: { email: emailA, password: passwordA },
    })
    assert.equal(registration.status, 201)
    assert.equal((await registration.json()).user.email, emailA)
    const registrationCookie = cookiePair(registration)
    assert.match(registration.headers.get('set-cookie'), /HttpOnly/i)
    assert.match(registration.headers.get('set-cookie'), /SameSite=Lax/i)
    assert.doesNotMatch(registration.headers.get('set-cookie'), /Secure/i)

    const duplicate = await jsonRequest(baseUrl, '/api/auth/register', {
      method: 'POST', body: { email: emailA.toUpperCase(), password: passwordA },
    })
    assert.equal(duplicate.status, 409)

    const storedA = await client.query(
      `SELECT id, password_hash FROM cartcheck.users WHERE email = $1`, [emailA]
    )
    assert.equal(storedA.rowCount, 1)
    assert.notEqual(storedA.rows[0].password_hash, passwordA)
    assert.match(storedA.rows[0].password_hash, /^\$2[aby]\$/)
    const sessionA = await client.query(
      `SELECT token_hash, expires_at FROM cartcheck.sessions WHERE user_id = $1`, [storedA.rows[0].id]
    )
    assert.equal(sessionA.rowCount, 1)
    const sessionTokenA = registrationCookie.split('=')[1]
    assert.notEqual(sessionA.rows[0].token_hash, sessionTokenA)
    assert.equal(sessionA.rows[0].token_hash, hashSessionToken(sessionTokenA))
    assert.ok(new Date(sessionA.rows[0].expires_at) > new Date())

    const ownedState = await client.query(
      `SELECT
         (SELECT count(*)::int FROM cartcheck.products WHERE user_id = $1) AS products,
         (SELECT count(*)::int FROM cartcheck.shopping_trips WHERE user_id = $1) AS trips`,
      [storedA.rows[0].id]
    )
    assert.equal(ownedState.rows[0].trips, 1, 'registration should create one private active trip')

    const badLogin = await jsonRequest(baseUrl, '/api/auth/login', {
      method: 'POST', body: { email: emailA, password: `${passwordA}wrong` },
    })
    const badLoginBody = await badLogin.json()
    assert.equal(badLogin.status, 401)
    assert.equal(badLoginBody.error, 'Invalid email or password')
    const unknownLogin = await jsonRequest(baseUrl, '/api/auth/login', {
      method: 'POST', body: { email: `absent-${suffix}@example.test`, password: passwordA },
    })
    assert.equal(unknownLogin.status, 401)
    assert.deepEqual(await unknownLogin.json(), badLoginBody, 'unknown and incorrect credentials should have the same response')

    const login = await jsonRequest(baseUrl, '/api/auth/login', {
      method: 'POST', body: { email: emailA, password: passwordA },
    })
    assert.equal(login.status, 200)
    const loginCookie = cookiePair(login)
    const restore = await jsonRequest(baseUrl, '/api/auth/session', { cookie: loginCookie })
    assert.equal(restore.status, 200)
    assert.equal((await restore.json()).user.email, emailA)

    const logout = await jsonRequest(baseUrl, '/api/auth/logout', { method: 'POST', cookie: loginCookie })
    assert.equal(logout.status, 204)
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0/i)
    assert.equal((await jsonRequest(baseUrl, '/api/auth/me', { cookie: loginCookie })).status, 401)

    const userB = await jsonRequest(baseUrl, '/api/auth/register', {
      method: 'POST', body: { email: emailB, password: passwordB },
    })
    assert.equal(userB.status, 201)
    const userBCookie = cookiePair(userB)
    const identityA = await jsonRequest(baseUrl, '/api/auth/me', { cookie: registrationCookie })
    const identityB = await jsonRequest(baseUrl, '/api/auth/me', { cookie: userBCookie })
    assert.equal(identityA.status, 200)
    assert.equal((await identityA.json()).user.email, emailA)
    assert.equal(identityB.status, 200)
    assert.equal((await identityB.json()).user.email, emailB)

    const storedB = await client.query('SELECT id FROM cartcheck.users WHERE email = $1', [emailB])
    assert.equal(storedB.rowCount, 1)
    const accountRows = await client.query(
      `SELECT user_id, count(*)::int AS trip_count
       FROM cartcheck.shopping_trips WHERE user_id = ANY($1::bigint[])
       GROUP BY user_id ORDER BY user_id`,
      [[storedA.rows[0].id, storedB.rows[0].id]]
    )
    assert.equal(accountRows.rowCount, 2, 'initial trip rows should remain scoped to their respective owners')
    assert.ok(accountRows.rows.every((row) => row.trip_count === 1))

    const aState = await client.query(
      `SELECT user_id FROM cartcheck.products WHERE user_id = $1`, [storedA.rows[0].id]
    )
    const bState = await client.query(
      `SELECT user_id FROM cartcheck.products WHERE user_id = $1`, [storedB.rows[0].id]
    )
    assert.ok(aState.rows.every((row) => String(row.user_id) === String(storedA.rows[0].id)))
    assert.ok(bState.rows.every((row) => String(row.user_id) === String(storedB.rows[0].id)))

    const invalidCookie = `${SESSION_COOKIE}=not-a-valid-session-token`
    assert.equal((await jsonRequest(baseUrl, '/api/auth/me', { cookie: invalidCookie })).status, 401)
    await client.query(
      `UPDATE cartcheck.sessions SET expires_at = now() - interval '1 second' WHERE user_id = $1`,
      [storedB.rows[0].id]
    )
    assert.equal((await jsonRequest(baseUrl, '/api/auth/me', { cookie: userBCookie })).status, 401)
  } catch (error) {
    throw new Error(`${error.message}\nAPI output:\n${logs}`)
  }
})
