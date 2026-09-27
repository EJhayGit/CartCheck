import test from 'node:test'
import assert from 'node:assert/strict'
import { amount, currency, quantity, sumKnownAmounts } from './values.js'

test('quantity accepts positive values at three decimal places', () => {
  assert.equal(quantity('0.001'), '0.001')
  assert.equal(quantity('12.5'), '12.500')
  for (const value of ['0', '-1', '1.0001', '1000000000', '', '1e2']) {
    assert.throws(() => quantity(value))
  }
})

test('blank item total remains unknown and zero remains known', () => {
  assert.equal(amount(null), null)
  assert.equal(amount(''), null)
  assert.equal(amount('0'), '0.00')
  assert.equal(amount('12.3'), '12.30')
  for (const value of ['-1', '1.001', '10000000000', 'NaN']) {
    assert.throws(() => amount(value))
  }
})

test('known totals use integer cents and report missing values', () => {
  assert.deepEqual(sumKnownAmounts(['0.10', null, '0.20', '0']), {
    knownTotal: '0.30', missingCount: 1,
  })
})

test('only approved trip currencies are valid', () => {
  for (const value of ['PHP', 'USD', 'EUR']) assert.equal(currency(value), value)
  assert.throws(() => currency('GBP'))
  assert.throws(() => currency('php'))
})
