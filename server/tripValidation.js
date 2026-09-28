import { quantity as normalizeQuantity } from './domain/values.js'
import { parseCatalogId } from './catalogValidation.js'
import { validateMoney } from './cartValidation.js'

export function parseTripId(value) {
  return parseCatalogId(value)
}

export function validateRevision(value) {
  if (!Number.isSafeInteger(value) || value < 1) return { error: 'Revision must be a positive integer' }
  return { revision: value }
}

export function validateCorrection(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== 2 || !Object.hasOwn(body, 'revision') || !Object.hasOwn(body, 'items')) {
    return { error: 'Provide the reviewed revision and complete item set' }
  }
  const revision = validateRevision(body.revision)
  if (revision.error) return revision
  if (!Array.isArray(body.items) || body.items.length > 500) return { error: 'Items must be an array of at most 500 entries' }

  const seen = new Set()
  const items = []
  for (const input of body.items) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Each item must be an object' }
    const allowed = ['id', 'productId', 'name', 'category', 'quantity', 'unitLabel', 'estimatedTotal', 'actualTotal', 'bought']
    if (Object.keys(input).some((key) => !allowed.includes(key))) return { error: 'Correction contains an unsupported item field' }
    const id = input.id === undefined ? null : parseTripId(String(input.id))
    if (input.id !== undefined && id === null) return { error: 'Invalid historical item ID' }
    if (id !== null && seen.has(id)) return { error: 'Historical item IDs must be unique' }
    if (id !== null) seen.add(id)
    if (id === null && Object.hasOwn(input, 'productId')) {
      return { error: 'New historical snapshots cannot reference catalog products' }
    }
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 120) {
      return { error: 'Name must be 1 to 120 characters' }
    }
    if (typeof input.category !== 'string' || !input.category.trim() || input.category.trim().length > 80) {
      return { error: 'Category must be 1 to 80 characters' }
    }
    let quantity
    try { quantity = normalizeQuantity(input.quantity) }
    catch { return { error: 'Quantity must be positive with up to three decimal places' } }
    if (input.unitLabel !== null && input.unitLabel !== undefined && typeof input.unitLabel !== 'string') {
      return { error: 'Unit label must be text' }
    }
    const unitLabel = input.unitLabel?.trim() || null
    if (unitLabel && unitLabel.length > 24) return { error: 'Unit label must be at most 24 characters' }
    if (typeof input.bought !== 'boolean') return { error: 'Bought status must be true or false' }
    const estimatedTotal = validateMoney(input.estimatedTotal ?? null, 'Estimated total')
    if (estimatedTotal && typeof estimatedTotal === 'object') return estimatedTotal
    const actualTotal = validateMoney(input.actualTotal ?? null, 'Actual total')
    if (actualTotal && typeof actualTotal === 'object') return actualTotal
    items.push({ id, productId: null, name: input.name.trim(), category: input.category.trim(), quantity, unitLabel,
      estimatedTotal, actualTotal, bought: input.bought })
  }
  return { revision: revision.revision, items }
}

export function validateHistoryQuery(query) {
  const rawLimit = query.limit ?? '20'
  if (!/^(?:[1-9]|[1-9]\d|100)$/.test(String(rawLimit))) return { error: 'Limit must be between 1 and 100' }
  const cursor = query.cursor
  if (cursor !== undefined) {
    try {
      if (typeof cursor !== 'string' || cursor.length > 512) throw new Error()
      const decoded = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'))
      if (!decoded || typeof decoded.completedAt !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(decoded.completedAt) ||
          new Date(decoded.completedAt).toISOString() !== decoded.completedAt) throw new Error()
      const id = parseTripId(String(decoded.id))
      if (id === null) throw new Error()
      return { limit: Number(rawLimit), cursor: { completedAt: decoded.completedAt, id: String(id) } }
    } catch { return { error: 'Invalid history cursor' } }
  }
  return { limit: Number(rawLimit), cursor: null }
}
