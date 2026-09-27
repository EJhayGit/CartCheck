import test from 'node:test'
import assert from 'node:assert/strict'
import { validateItemChanges } from './cartValidation.js'

test('cart changes accept exact positive quantities and an optional short unit', () => {
  assert.deepEqual(validateItemChanges({ name: ' Fresh milk ', quantity: '1.125', unitLabel: ' cartons ' }), {
    name: 'Fresh milk', quantity: '1.125', unitLabel: 'cartons',
  })
  assert.deepEqual(validateItemChanges({ quantity: 2, unitLabel: '' }), {
    quantity: '2.000', unitLabel: null,
  })
})

test('cart changes reject invalid quantities, names, units, and future fields', () => {
  for (const changes of [
    {}, { quantity: 0 }, { quantity: -1 }, { quantity: '1.0001' },
    { quantity: '1e3' }, { quantity: null }, { name: ' ' },
    { name: 'x'.repeat(121) }, { unitLabel: 'x'.repeat(25) },
    { bought: true }, { estimatedTotal: '10.00' },
  ]) {
    assert.ok(validateItemChanges(changes).error, JSON.stringify(changes))
  }
})
