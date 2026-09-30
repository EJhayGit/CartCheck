import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isAuthStatusEndpoint,
  normalizeEmail,
  publicUser,
  requiresEmailVerification,
  validatePassword,
} from './authValidation.js'

test('new passwords meet the minimum length and bcrypt UTF-8 byte limit', () => {
  assert.equal(validatePassword('1234567', { creating: true }), false)
  assert.equal(validatePassword('12345678', { creating: true }), true)
  assert.equal(validatePassword('😀'.repeat(4), { creating: true }), false)
  assert.equal(validatePassword('😀'.repeat(8), { creating: true }), true)
  assert.equal(validatePassword('a'.repeat(72), { creating: true }), true)
  assert.equal(validatePassword('a'.repeat(73), { creating: true }), false)
  assert.equal(validatePassword('😀'.repeat(18), { creating: true }), true)
  assert.equal(validatePassword('😀'.repeat(19), { creating: true }), false)
  assert.equal(validatePassword('', { creating: true }), false)
  assert.equal(validatePassword(null, { creating: true }), false)
})

test('existing passwords remain usable for login and current-password checks', () => {
  assert.equal(validatePassword('short'), true)
  assert.equal(validatePassword('a'.repeat(72)), true)
  assert.equal(validatePassword('a'.repeat(73)), false)
  assert.equal(validatePassword(''), false)
  assert.equal(validatePassword(null), false)
})

test('verification enforcement exempts verified and legacy users only', () => {
  assert.equal(requiresEmailVerification({ email_verified: false }, true), true)
  assert.equal(requiresEmailVerification({ email_verified: true }, true), false)
  assert.equal(requiresEmailVerification({ email_verified: false, legacy_verification_exempt: true }, true), false)
  assert.equal(requiresEmailVerification({ email_verified: false }, false), false)
  assert.equal(isAuthStatusEndpoint('/api/auth/me'), true)
  assert.equal(isAuthStatusEndpoint('/api/auth/session'), true)
  assert.equal(isAuthStatusEndpoint('/api/me/settings'), false)
  assert.equal(isAuthStatusEndpoint('/api/catalog'), false)
})

test('public auth state reports verification requirement without exposing exemption', () => {
  const previous = process.env.REQUIRE_VERIFIED_EMAIL
  process.env.REQUIRE_VERIFIED_EMAIL = 'true'
  try {
    assert.deepEqual(publicUser({
      id: 1, email: 'shopper@example.com', preferred_currency: 'PHP',
      email_verified: false, legacy_verification_exempt: true,
    }), {
      id: '1', email: 'shopper@example.com', preferred_currency: 'PHP',
      email_verified: false, verification_required: false,
    })
  } finally {
    if (previous === undefined) delete process.env.REQUIRE_VERIFIED_EMAIL
    else process.env.REQUIRE_VERIFIED_EMAIL = previous
  }
})

test('email normalization remains case-insensitive and trimmed', () => {
  assert.equal(normalizeEmail(' Shopper@Example.com '), 'shopper@example.com')
  assert.equal(normalizeEmail('invalid'), null)
})
