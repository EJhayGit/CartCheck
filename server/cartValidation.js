import { quantity as normalizeQuantity } from './domain/values.js'
import { parseCatalogId } from './catalogValidation.js'

export const parseItemId = parseCatalogId

export function validateItemChanges(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Provide item changes' }
  const keys = Object.keys(body)
  if (!keys.length || keys.some((key) => !['name', 'quantity', 'unitLabel', 'bought'].includes(key))) {
    return { error: 'Only name, quantity, unit label, and bought status can be changed' }
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
  return changes
}
