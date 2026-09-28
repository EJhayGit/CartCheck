import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateCartChanges,
  validateCurrencyChanges,
  validateItemChanges,
} from './cartValidation.js'

test('cart changes accept exact positive quantities and an optional short unit', () => {
  assert.deepEqual(validateItemChanges({ name: ' Fresh milk ', quantity: '1.125', unitLabel: ' cartons ' }), {
    name: 'Fresh milk', quantity: '1.125', unitLabel: 'cartons',
  })
  assert.deepEqual(validateItemChanges({ quantity: 2, unitLabel: '' }), {
    quantity: '2.000', unitLabel: null,
  })
  assert.deepEqual(validateItemChanges({ bought: true }), { bought: true })
  assert.deepEqual(validateItemChanges({ bought: false }), { bought: false })
})

test('cart changes reject invalid quantities, names, units, and future fields', () => {
  for (const changes of [
    {}, { quantity: 0 }, { quantity: -1 }, { quantity: '1.0001' },
    { quantity: '1e3' }, { quantity: null }, { name: ' ' },
    { name: 'x'.repeat(121) }, { unitLabel: 'x'.repeat(25) },
    { bought: 'true' }, { bought: 1 }, { bought: null },
    { subtotal: '10.00' },
  ]) {
    assert.ok(validateItemChanges(changes).error, JSON.stringify(changes))
  }
})

test('optional item totals preserve null and valid zero while enforcing currency precision', () => {
  assert.deepEqual(validateItemChanges({ estimatedTotal: '0' }), { estimatedTotal: '0.00' })
  assert.deepEqual(validateItemChanges({ actualTotal: 0 }), { actualTotal: '0.00' })
  assert.deepEqual(validateItemChanges({ estimatedTotal: null, actualTotal: '12.3' }), {
    estimatedTotal: null, actualTotal: '12.30',
  })
  for (const value of [-1, '-0.01', '1.001', '1e2', '10000000000.00', '', false]) {
    assert.ok(validateItemChanges({ estimatedTotal: value }).error, `expected rejection for ${value}`)
  }
})

test('budget and preferred currency changes accept only their explicit fields', () => {
  assert.deepEqual(validateCartChanges({ budget: '0' }), { budget: '0.00' })
  assert.deepEqual(validateCartChanges({ budget: null }), { budget: null })
  assert.ok(validateCartChanges({ budget: '-1' }).error)
  assert.ok(validateCartChanges({ budget: '1.234' }).error)
  assert.ok(validateCartChanges({ budget: null, currency: 'USD' }).error)
  assert.deepEqual(validateCurrencyChanges({ preferredCurrency: 'EUR' }), { preferredCurrency: 'EUR' })
  for (const value of ['GBP', 'eur', null]) assert.ok(validateCurrencyChanges({ preferredCurrency: value }).error)
  assert.ok(validateCurrencyChanges({ preferredCurrency: 'USD', budget: 20 }).error)
})
