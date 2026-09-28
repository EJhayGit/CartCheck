import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareCorrectionItems } from './tripCorrections.js'

const item = (changes = {}) => ({ name: ' Apples ', category: ' Produce ', quantity: '1.500', unitLabel: ' kg ', estimatedTotal: '', actualTotal: '0', bought: true, ...changes })

test('correction preparation keeps unknown and zero distinct and trims snapshot fields', () => {
  const [prepared] = prepareCorrectionItems([item()])
  assert.equal(prepared.name, 'Apples')
  assert.equal(prepared.category, 'Produce')
  assert.equal(prepared.unitLabel, 'kg')
  assert.equal(prepared.estimatedTotal, null)
  assert.equal(prepared.actualTotal, '0.00')
  assert.equal(prepared.quantity, '1.500')
})

test('correction preparation rejects invalid historical quantities and amounts before confirmation', () => {
  assert.throws(() => prepareCorrectionItems([item({ quantity: '0' })]), /quantity/)
  assert.throws(() => prepareCorrectionItems([item({ quantity: '1.0001' })]), /quantity/)
  assert.throws(() => prepareCorrectionItems([item({ actualTotal: '-1' })]), /nonnegative amount/)
})
