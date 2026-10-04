import test from 'node:test'
import assert from 'node:assert/strict'
import { budgetProgress, moneySummary, formatMoney } from './money.js'

test('budget meters retain exact known totals, zero, missing prices and actual bought semantics', () => {
  const summary = moneySummary([
    { bought: true, estimatedTotal: '750.00', actualTotal: '600.00' },
    { bought: true, estimatedTotal: null, actualTotal: '0.00' },
    { bought: false, estimatedTotal: '500.00', actualTotal: '900.00' },
  ])
  assert.equal(budgetProgress(null, summary.estimated), null)
  assert.equal(budgetProgress('2000.00', moneySummary([{ estimatedTotal: null }]).estimated), null)
  assert.deepEqual(budgetProgress('2000.00', summary.estimated), { over: false, value: '750.00', reached: false, percent: 62.5, incomplete: true })
  assert.equal(budgetProgress('600.00', summary.actual).reached, true)
  assert.equal(budgetProgress('500.00', summary.actual).value, '100.00')
  assert.equal(budgetProgress('500.00', summary.actual).percent, 100)
  assert.equal(budgetProgress('0.00', summary.actual).percent, 100)
  const free = moneySummary([{ bought: true, actualTotal: '0.00' }]).actual
  assert.equal(budgetProgress('0.00', free).reached, true)
  assert.equal(budgetProgress('0.00', free).percent, 0)
  for (const [currency, symbol] of [['PHP', '₱'], ['USD', '$'], ['EUR', '€']]) assert.equal(formatMoney(summary.actual.total, currency), `${symbol}600.00`)
})
