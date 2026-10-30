import test from 'node:test'
import assert from 'node:assert/strict'
import { formatMoney, moneyDifference, moneySummary, normalizeMoney } from './money.js'

test('blank, explicit zero, and invalid amounts remain distinct', () => {
  assert.equal(normalizeMoney(''), null)
  assert.equal(normalizeMoney('0'), '0.00')
  assert.equal(normalizeMoney('12.3'), '12.30')
  for (const invalid of ['-1', '1.001', '1e2', 'NaN', '10000000000', ' 1 2 ']) {
    assert.throws(() => normalizeMoney(invalid))
  }
})

test('summaries use exact cents, count missing prices, and include actual only when bought', () => {
  const result = moneySummary([
    { bought: true, estimatedTotal: '0.10', actualTotal: '0.00' },
    { bought: true, estimatedTotal: null, actualTotal: null },
    { bought: false, estimatedTotal: '0.20', actualTotal: '9.00' },
  ])
  assert.deepEqual(result, {
    estimated: { total: '0.30', missingCount: 1, knownCount: 2 },
    actual: { total: '0.00', missingCount: 1, knownCount: 1 },
  })
  assert.deepEqual(moneyDifference('0.20', result.estimated.total), { over: true, value: '0.10' })
})

test('money formatting groups thousands without rounding the decimal string', () => {
  assert.equal(formatMoney('12500.00', 'PHP'), '₱12,500.00')
  assert.equal(formatMoney('1234567.05', 'USD'), '$1,234,567.05')
  assert.equal(formatMoney('999.99', 'EUR'), '€999.99')
  assert.equal(formatMoney('0.00', 'PHP'), '₱0.00')
})
