import assert from 'node:assert/strict'
import test from 'node:test'
import { passwordStrength } from './passwordStrength.js'

test('strength output contains guidance but never returns the supplied password', () => {
  const secret = 'violet-river-lantern-73!'
  const result = passwordStrength(secret, 'shopper@example.test')

  assert.ok(result)
  assert.equal(result.label, 'Strong')
  assert.equal(Object.hasOwn(result, 'password'), false)
  assert.equal(JSON.stringify(result).includes(secret), false)
})

test('empty input has no strength result and short passwords remain weak', () => {
  assert.equal(passwordStrength(''), null)
  assert.equal(passwordStrength('tiny').label, 'Weak')
})

test('pattern-aware ratings cover each state and resist predictable character variety', () => {
  assert.equal(passwordStrength('Password1!').label, 'Weak')
  assert.equal(passwordStrength('river-path').label, 'Fair')
  assert.equal(passwordStrength('freshRiver7').label, 'Good')
  assert.equal(passwordStrength('cobalt-violet-orbit-puzzle').label, 'Strong')
  for (const value of ['Qwerty123!', 'Abc123!Abc123!', 'aaaaaaaaAAAA1111!!!!', 'CartCheck2026!']) {
    assert.notEqual(passwordStrength(value).label, 'Strong')
  }
  assert.notEqual(passwordStrength('tR8!vQ2#kL9').label, 'Strong')
})
