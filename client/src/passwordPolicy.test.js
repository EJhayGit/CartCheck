import assert from 'node:assert/strict'
import test from 'node:test'
import { confirmationError, passwordError, PASSWORD_HINT } from './passwordPolicy.js'

test('password policy accepts the minimum and reports when it is missed', () => {
  assert.match(passwordError('a'.repeat(7)), /at least 8 characters/)
  assert.equal(passwordError('a'.repeat(8)), '')
  assert.equal(passwordError('a'.repeat(10)), '')
  assert.match(passwordError('😀'.repeat(4)), /at least 8 characters/)
  assert.equal(passwordError('😀'.repeat(8)), '')
  assert.match(PASSWORD_HINT, /10 or more is recommended/)
})

test('password policy measures the bcrypt limit in UTF-8 bytes', () => {
  assert.equal(passwordError('é'.repeat(36)), '') // 72 UTF-8 bytes
  assert.match(passwordError('é'.repeat(37)), /72 UTF-8 bytes or fewer/) // 74 bytes
  assert.equal(passwordError('😀'.repeat(18)), '') // 72 UTF-8 bytes
  assert.match(passwordError('😀'.repeat(19)), /72 UTF-8 bytes or fewer/) // 76 bytes
})

test('confirmation must be present and match exactly', () => {
  assert.match(confirmationError('correct horse battery', ''), /Confirm your password/)
  assert.match(confirmationError('correct horse battery', 'correct horse batteries'), /do not match/)
  assert.equal(confirmationError('correct horse battery', 'correct horse battery'), '')
})
