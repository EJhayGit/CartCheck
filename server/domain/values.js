// Exact decimal strings at the API boundary. PostgreSQL NUMERIC stores these
// without JavaScript floating-point rounding.
function decimal(value, scale, wholeDigits, { optional = false, positive = false } = {}) {
  if (optional && (value === null || value === '')) return null
  if (typeof value !== 'string' && typeof value !== 'number') throw new TypeError('Expected a decimal value')
  const input = String(value)
  const pattern = new RegExp(`^(?:0|[1-9]\\d{0,${wholeDigits - 1}})(?:\\.\\d{1,${scale}})?$`)
  if (!pattern.test(input)) throw new RangeError('Invalid decimal precision or range')
  const [whole, fraction = ''] = input.split('.')
  const units = BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, '0'))
  if (positive && units === 0n) throw new RangeError('Value must be positive')
  return `${whole}.${fraction.padEnd(scale, '0')}`
}

export function quantity(value) {
  return decimal(value, 3, 9, { positive: true })
}

export function amount(value) {
  return decimal(value, 2, 10, { optional: true })
}

export function currency(value) {
  if (!['PHP', 'USD', 'EUR'].includes(value)) throw new RangeError('Unsupported currency')
  return value
}

export function sumKnownAmounts(values) {
  let cents = 0n
  let missing = 0
  for (const value of values) {
    const normalized = amount(value)
    if (normalized === null) {
      missing++
      continue
    }
    cents += BigInt(normalized.replace('.', ''))
  }
  const whole = cents / 100n
  const fraction = String(cents % 100n).padStart(2, '0')
  return { knownTotal: `${whole}.${fraction}`, missingCount: missing }
}
