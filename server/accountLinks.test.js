import test from 'node:test'
import assert from 'node:assert/strict'
import { accountActionUrl } from './accountLinks.js'

test('account action links use the configured production HTTPS origin and encode tokens', () => {
  const options = { clientOrigin: 'https://cartcheck.merzbuilds.dev/' }
  assert.equal(
    accountActionUrl('verify_email', 'a&b', options),
    'https://cartcheck.merzbuilds.dev/#action=verify&token=a%26b'
  )
  assert.equal(
    accountActionUrl('reset_password', 'a&b', options),
    'https://cartcheck.merzbuilds.dev/#action=reset&token=a%26b'
  )
})

test('account action links use the allowed origin when no client origin is configured', () => {
  assert.equal(
    accountActionUrl('verify_email', 'token', { clientOrigin: '', fallbackOrigin: 'http://localhost:5173' }),
    'http://localhost:5173/#action=verify&token=token'
  )
})
