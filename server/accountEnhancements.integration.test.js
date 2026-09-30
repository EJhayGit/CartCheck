import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import { createActionToken, hashSessionToken } from './authSecurity.js'
import { poolConfig } from './db/config.js'
import { assertUnusedTestEmails, testEmails } from './testDatabaseSafety.js'
import { issueAccountToken } from './authRepo.js'

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
      if ((await fetch(`${baseUrl}/readyz`)).ok) return
    } catch { /* Wait until the child binds its port. */ }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`API did not become ready: ${output()}`)
}

async function request(baseUrl, path, { method = 'GET', body, cookie, origin = method === 'GET' ? undefined : 'http://localhost:5173' } = {}) {
  const headers = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (cookie) headers.cookie = cookie
  if (origin) headers.origin = origin
  return fetch(`${baseUrl}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
}

function sessionCookie(response) {
  const value = response.headers.get('set-cookie')
  assert.ok(value, 'expected a session cookie')
  return value.split(';', 1)[0]
}

test('account verification and password recovery tokens expire, replay safely, and revoke sessions', {
  skip: !databaseUrl && 'Use the guarded testIntegrationDev.js runner for database API tests',
}, async (t) => {
  const client = new pg.Pool(poolConfig({ ...process.env, DATABASE_URL: databaseUrl }))
  const [emailA, emailB] = testEmails(runId).slice(6, 8)
  await assertUnusedTestEmails(client, [emailA, emailB])
  const password = `Enhancement-${randomUUID()}!`
  const replacement = `Replacement-${randomUUID()}!`
  const port = await unusedPort()
  const baseUrl = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('.', import.meta.url),
    env: { ...process.env, DATABASE_URL: databaseUrl, PORT: String(port), NODE_ENV: 'test', REQUIRE_VERIFIED_EMAIL: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  child.stdout.setEncoding('utf8').on('data', (chunk) => { logs += chunk })
  child.stderr.setEncoding('utf8').on('data', (chunk) => { logs += chunk })
  t.after(async () => {
    child.kill()
    if (child.exitCode === null) await once(child, 'exit')
    await client.end()
  })

  try {
    await waitForServer(baseUrl, child, () => logs)

    const registration = await request(baseUrl, '/api/auth/register', { method: 'POST', body: { email: emailA, password } })
    assert.equal(registration.status, 201)
    const registrationCookie = sessionCookie(registration)
    const registered = await client.query('SELECT id, email_verified, legacy_verification_exempt FROM cartcheck.users WHERE email = $1', [emailA])
    assert.equal(registered.rowCount, 1)
    assert.equal(registered.rows[0].email_verified, false)
    assert.equal(registered.rows[0].legacy_verification_exempt, false)
    assert.equal((await request(baseUrl, '/api/auth/me', { cookie: registrationCookie })).status, 200,
      'an unverified account must be able to restore its session and read verification state')
    assert.equal((await request(baseUrl, '/api/auth/session', { cookie: registrationCookie })).status, 200,
      'session restoration must remain available before email verification')
    assert.equal((await request(baseUrl, '/api/catalog', { cookie: registrationCookie })).status, 403,
      'unverified accounts must not access protected data')
    assert.equal((await request(baseUrl, '/api/me/settings', {
      method: 'PATCH', cookie: registrationCookie, body: { preferredCurrency: 'USD' },
    })).status, 403, 'unverified accounts must not change protected settings')

    // A resend inside the cooldown returns the same generic response and must not replace the active token.
    const beforeResend = await client.query("SELECT token_hash FROM cartcheck.auth_action_tokens WHERE user_id = $1 AND purpose = 'verify_email'", [registered.rows[0].id])
    const resend = await request(baseUrl, '/api/auth/resend-verification', { method: 'POST', body: { email: emailA } })
    assert.equal(resend.status, 202)
    assert.deepEqual(await resend.json(), { message: 'If the account is eligible, instructions will be sent.' })
    const afterResend = await client.query("SELECT token_hash FROM cartcheck.auth_action_tokens WHERE user_id = $1 AND purpose = 'verify_email'", [registered.rows[0].id])
    assert.deepEqual(afterResend.rows.map((row) => row.token_hash), beforeResend.rows.map((row) => row.token_hash))

    const verification = createActionToken()
    assert.equal(await issueAccountToken(client, { userId: registered.rows[0].id, purpose: 'verify_email', tokenHash: verification.tokenHash }), false,
      'the verification resend cooldown should suppress issuance')
    await client.query("UPDATE cartcheck.auth_email_limits SET last_sent_at = now() - interval '61 seconds' WHERE user_id = $1 AND purpose = 'verify_email'", [registered.rows[0].id])
    assert.equal(await issueAccountToken(client, { userId: registered.rows[0].id, purpose: 'verify_email', tokenHash: verification.tokenHash }), true)
    const verified = await request(baseUrl, '/api/auth/verify-email', { method: 'POST', body: { token: verification.token } })
    assert.equal(verified.status, 200)
    assert.equal((await verified.json()).verified, true)
    assert.equal((await request(baseUrl, '/api/auth/verify-email', { method: 'POST', body: { token: verification.token } })).status, 400,
      'a consumed verification token must not be replayable')

    const expiredVerification = createActionToken()
    await client.query("UPDATE cartcheck.auth_email_limits SET last_sent_at = now() - interval '61 seconds' WHERE user_id = $1 AND purpose = 'verify_email'", [registered.rows[0].id])
    assert.equal(await issueAccountToken(client, { userId: registered.rows[0].id, purpose: 'verify_email', tokenHash: expiredVerification.tokenHash }), true)
    await client.query("UPDATE cartcheck.auth_action_tokens SET expires_at = now() - interval '1 second' WHERE token_hash = $1", [expiredVerification.tokenHash])
    assert.equal((await request(baseUrl, '/api/auth/verify-email', { method: 'POST', body: { token: expiredVerification.token } })).status, 400)
    assert.equal((await client.query('SELECT email_verified FROM cartcheck.users WHERE id = $1', [registered.rows[0].id])).rows[0].email_verified, true)

    const login = await request(baseUrl, '/api/auth/login', { method: 'POST', body: { email: emailA, password } })
    assert.equal(login.status, 200)
    const loginCookie = sessionCookie(login)
    const beforeResetSession = await request(baseUrl, '/api/auth/session', { cookie: loginCookie })
    assert.equal(beforeResetSession.status, 200)

    const unknownRecovery = await request(baseUrl, '/api/auth/forgot-password', {
      method: 'POST', body: { email: `unknown-${runId}@example.test` },
    })
    const knownRecovery = await request(baseUrl, '/api/auth/forgot-password', {
      method: 'POST', body: { email: emailA },
    })
    assert.equal(unknownRecovery.status, 202)
    assert.equal(knownRecovery.status, 202)
    assert.deepEqual(await knownRecovery.json(), await unknownRecovery.json(),
      'recovery requests must not reveal whether the account exists')
    let requestedReset
    for (let attempt = 0; attempt < 30; attempt++) {
      requestedReset = await client.query(
        "SELECT token_hash FROM cartcheck.auth_action_tokens WHERE user_id = $1 AND purpose = 'reset_password'",
        [registered.rows[0].id],
      )
      if (requestedReset.rowCount) break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.equal(requestedReset.rowCount, 1, 'known account should receive a hashed reset token')

    const expiredReset = createActionToken()
    await client.query("UPDATE cartcheck.auth_email_limits SET last_sent_at = now() - interval '61 seconds' WHERE user_id = $1 AND purpose = 'reset_password'", [registered.rows[0].id])
    await issueAccountToken(client, { userId: registered.rows[0].id, purpose: 'reset_password', tokenHash: expiredReset.tokenHash })
    await client.query("UPDATE cartcheck.auth_action_tokens SET expires_at = now() - interval '1 second' WHERE token_hash = $1", [expiredReset.tokenHash])
    assert.equal((await request(baseUrl, '/api/auth/reset-password', { method: 'POST', body: { token: expiredReset.token, password: replacement } })).status, 400)
    assert.equal((await request(baseUrl, '/api/auth/session', { cookie: loginCookie })).status, 200,
      'an expired reset token must not revoke the existing session')

    const reset = createActionToken()
    await client.query("UPDATE cartcheck.auth_email_limits SET last_sent_at = now() - interval '61 seconds' WHERE user_id = $1 AND purpose = 'reset_password'", [registered.rows[0].id])
    assert.equal(await issueAccountToken(client, { userId: registered.rows[0].id, purpose: 'reset_password', tokenHash: reset.tokenHash }), true)
    const resetResponse = await request(baseUrl, '/api/auth/reset-password', { method: 'POST', body: { token: reset.token, password: replacement } })
    assert.equal(resetResponse.status, 200)
    assert.deepEqual(await resetResponse.json(), { message: 'Password updated successfully.' })
    assert.equal((await request(baseUrl, '/api/auth/reset-password', { method: 'POST', body: { token: reset.token, password } })).status, 400,
      'a consumed reset token must not be replayable')
    assert.equal((await request(baseUrl, '/api/auth/session', { cookie: loginCookie })).status, 401,
      'password reset must revoke existing sessions')
    assert.equal((await request(baseUrl, '/api/auth/login', { method: 'POST', body: { email: emailA, password } })).status, 401)
    const replacementLogin = await request(baseUrl, '/api/auth/login', { method: 'POST', body: { email: emailA, password: replacement } })
    assert.equal(replacementLogin.status, 200)

    const incorrectCurrent = await request(baseUrl, '/api/auth/change-password', {
      method: 'POST', cookie: sessionCookie(replacementLogin), body: { currentPassword: password, newPassword: `Change-${randomUUID()}!` },
    })
    assert.equal(incorrectCurrent.status, 400)
    assert.equal((await request(baseUrl, '/api/auth/login', { method: 'POST', body: { email: emailA, password: replacement } })).status, 200,
      'an incorrect current password must leave the account password unchanged')
    const weakPassword = await request(baseUrl, '/api/auth/change-password', {
      method: 'POST', cookie: sessionCookie(replacementLogin), body: { currentPassword: replacement, newPassword: 'short' },
    })
    assert.equal(weakPassword.status, 400)
    assert.match((await weakPassword.json()).error, /8 to 72 UTF-8 bytes/)
    const currentSession = sessionCookie(replacementLogin)
    const changedPassword = `Changed-${randomUUID()}!`
    const change = await request(baseUrl, '/api/auth/change-password', {
      method: 'POST', cookie: currentSession,
      body: { currentPassword: replacement, newPassword: changedPassword },
    })
    assert.equal(change.status, 200)
    assert.equal((await request(baseUrl, '/api/auth/session', { cookie: currentSession })).status, 401,
      'changing a password must revoke every existing session')
    assert.equal((await request(baseUrl, '/api/auth/login', { method: 'POST', body: { email: emailA, password: replacement } })).status, 401)
    assert.equal((await request(baseUrl, '/api/auth/login', { method: 'POST', body: { email: emailA, password: changedPassword } })).status, 200)

    // Legacy accounts remain exempt and can still authenticate when enforcement is enabled.
    const legacyEmail = emailB
    const legacyHash = await bcrypt.hash(password, 4)
    const legacy = await client.query(
      `INSERT INTO cartcheck.users (email, password_hash, email_verified, legacy_verification_exempt)
       VALUES ($1, $2, false, true) RETURNING id`, [legacyEmail, legacyHash]
    )
    const legacyLogin = await request(baseUrl, '/api/auth/login', { method: 'POST', body: { email: legacyEmail, password } })
    assert.equal(legacyLogin.status, 200)
    const legacyMe = await request(baseUrl, '/api/auth/me', { cookie: sessionCookie(legacyLogin) })
    assert.equal(legacyMe.status, 200)
    assert.equal((await legacyMe.json()).user.verification_required, false)
    assert.equal((await request(baseUrl, '/api/catalog', { cookie: sessionCookie(legacyLogin) })).status, 200,
      'legacy verification-exempt accounts must retain protected access')
    assert.equal((await client.query('SELECT id FROM cartcheck.users WHERE id = $1', [legacy.rows[0].id])).rowCount, 1)
  } catch (error) {
    throw new Error(`${error.message}\nAPI output:\n${logs}`)
  }
})
