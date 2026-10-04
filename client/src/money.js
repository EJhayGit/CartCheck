export function normalizeMoney(value) {
  if (value === null || value === '') return null
  const raw = String(value).trim()
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(raw)) throw new RangeError('Enter a nonnegative amount with up to two decimal places.')
  const [whole, fraction = ''] = raw.split('.')
  return `${whole}.${fraction.padEnd(2, '0')}`
}

export function moneySummary(items) {
  const total = (entries, field) => {
    let cents = 0n
    let missingCount = 0
    let knownCount = 0
    for (const item of entries) {
      const value = item[field]
      if (value === null || value === undefined) { missingCount++; continue }
      const normalized = normalizeMoney(value)
      cents += BigInt(normalized.replace('.', ''))
      knownCount++
    }
    return { total: `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`, missingCount, knownCount }
  }
  return {
    estimated: total(items, 'estimatedTotal'),
    actual: total(items.filter((item) => item.bought), 'actualTotal'),
  }
}

export function moneyDifference(left, right) {
  const cents = (value) => {
    if (!/^\d+\.\d{2}$/.test(String(value))) throw new RangeError('Invalid monetary total')
    return BigInt(String(value).replace('.', ''))
  }
  const difference = cents(left) - cents(right)
  const absolute = difference < 0n ? -difference : difference
  return { over: difference < 0n, value: `${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}` }
}

export function formatMoney(value, currency) {
  const symbol = { PHP: '₱', USD: '$', EUR: '€' }[currency] || currency
  return `${symbol}${value}`
}

// Each comparison retains the existing estimate/actual semantics. There is no
// blended forecast: actual spending still includes only bought, priced items.
export function budgetProgress(budget, summary) {
  if (budget === null || budget === undefined || !summary.knownCount) return null
  const normalizedBudget = normalizeMoney(budget)
  const comparison = moneyDifference(normalizedBudget, summary.total)
  const cents = (value) => BigInt(value.replace('.', ''))
  const limit = cents(normalizedBudget)
  const spent = cents(summary.total)
  const percent = limit === 0n ? (spent > 0n ? 100 : 0) : Number(spent * 10000n / limit) / 100
  return { ...comparison, reached: comparison.value === '0.00', percent: Math.min(100, percent), incomplete: summary.missingCount > 0 }
}
