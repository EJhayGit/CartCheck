import { quantity as normalizeQuantity } from './domain/values.js'
import { parseCatalogId } from './catalogValidation.js'

export const parseItemId = parseCatalogId

const CURRENCIES = new Set(['PHP', 'USD', 'EUR'])

export function validateMoney(value, label = 'Amount') {
  if (value === null) return null
  let text
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { error: `${label} must be a nonnegative amount with at most two decimal places` }
    text = String(value)
  } else if (typeof value === 'string') text = value.trim()
  else return { error: `${label} must be a nonnegative amount with at most two decimal places` }

  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(text)) {
    return { error: `${label} must be a nonnegative amount with at most two decimal places` }
  }
  const [whole, fraction = ''] = text.split('.')
  return `${whole}.${fraction.padEnd(2, '0')}`
}

export function validateCurrencyChanges(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !Object.hasOwn(body, 'preferredCurrency')) {
    return { error: 'Provide a preferred currency' }
  }
  if (!CURRENCIES.has(body.preferredCurrency)) return { error: 'Currency must be PHP, USD, or EUR' }
  return { preferredCurrency: body.preferredCurrency }
}

export function validateCartChanges(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !Object.hasOwn(body, 'budget')) {
    return { error: 'Provide a trip budget' }
  }
  const budget = validateMoney(body.budget, 'Budget')
  return budget && typeof budget === 'object' ? budget : { budget }
}

export function validateItemChanges(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Provide item changes' }
  const keys = Object.keys(body)
  if (!keys.length || keys.some((key) => !['name', 'quantity', 'unitLabel', 'bought', 'estimatedTotal', 'actualTotal'].includes(key))) {
    return { error: 'Only name, quantity, unit label, prices, and bought status can be changed' }
  }
  const changes = {}
  if (Object.hasOwn(body, 'name')) {
    if (typeof body.name !== 'string') return { error: 'Name must be text' }
    const name = body.name.trim()
    if (name.length < 1 || name.length > 120) return { error: 'Name must be 1 to 120 characters' }
    changes.name = name
  }
  if (Object.hasOwn(body, 'quantity')) {
    try { changes.quantity = normalizeQuantity(body.quantity) }
    catch { return { error: 'Quantity must be positive with up to three decimal places' } }
  }
  if (Object.hasOwn(body, 'unitLabel')) {
    if (body.unitLabel !== null && typeof body.unitLabel !== 'string') return { error: 'Unit label must be text' }
    const unitLabel = body.unitLabel?.trim() || null
    if (unitLabel && unitLabel.length > 24) return { error: 'Unit label must be at most 24 characters' }
    changes.unitLabel = unitLabel
  }
  if (Object.hasOwn(body, 'bought')) {
    if (typeof body.bought !== 'boolean') return { error: 'Bought status must be true or false' }
    changes.bought = body.bought
  }
  for (const key of ['estimatedTotal', 'actualTotal']) {
    if (!Object.hasOwn(body, key)) continue
    const total = validateMoney(body[key], key === 'estimatedTotal' ? 'Estimated total' : 'Actual total')
    if (total && typeof total === 'object') return total
    changes[key] = total
  }
  return changes
}
