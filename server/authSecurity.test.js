import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createSessionToken,
  expiredSessionCookie,
  hashSessionToken,
  SESSION_COOKIE,
  sessionCookie,
} from './authSecurity.js'

test('session token is opaque, random, and stored as a one-way hash', () => {
  const first = createSessionToken()
  const second = createSessionToken()
  assert.match(first.token, /^[A-Za-z0-9_-]{40,}$/)
  assert.notEqual(first.token, second.token)
  assert.equal(first.tokenHash, hashSessionToken(first.token))
  assert.notEqual(first.tokenHash, first.token)
  assert.match(first.tokenHash, /^[a-f0-9]{64}$/)
})

test('production session cookies are HttpOnly, secure, and revoked with matching attributes', () => {
  const token = createSessionToken().token
  const cookie = sessionCookie(token, { production: true })
  assert.match(cookie, new RegExp(`^${SESSION_COOKIE}=${token};`))
  assert.match(cookie, /; HttpOnly;/)
  assert.match(cookie, /; Secure(?:;|$)/)
  assert.match(cookie, /; SameSite=Lax;/)

  const expired = expiredSessionCookie({ production: true })
  assert.match(expired, new RegExp(`^${SESSION_COOKIE}=;`))
  assert.match(expired, /; HttpOnly;/)
  assert.match(expired, /; Secure(?:;|$)/)
  assert.match(expired, /; SameSite=Lax;/)
  assert.match(expired, /Max-Age=0/)
})
