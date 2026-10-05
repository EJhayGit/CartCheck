import { parseCatalogId } from './catalogValidation.js'
import { validateMoney } from './cartValidation.js'

export const parseListId = parseCatalogId

export function normalizeListName(value) {
  if (typeof value !== 'string') return null
  const name = value.trim()
  return [...name].length >= 1 && [...name].length <= 100 ? name : null
}

export function validateListCreate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some((key) => !['name', 'budget', 'currency'].includes(key)) || !Object.hasOwn(body, 'name')) {
    return { error: 'Provide a list name and optional budget and currency' }
  }
  const name = normalizeListName(body.name)
  if (name === null) return { error: 'Name must be 1 to 100 characters' }
  if (Object.hasOwn(body, 'currency') && !['PHP', 'USD', 'EUR'].includes(body.currency)) {
    return { error: 'Currency must be PHP, USD, or EUR' }
  }
  let budget = null
  if (Object.hasOwn(body, 'budget')) {
    budget = validateMoney(body.budget, 'Budget')
    if (budget && typeof budget === 'object') return budget
  }
  return { name, budget, currency: body.currency }
}

export function validateListChanges(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Provide list changes' }
  const keys = Object.keys(body)
  if (!keys.length || keys.some((key) => !['name', 'budget'].includes(key))) return { error: 'Only name and budget can be changed' }
  const changes = {}
  if (Object.hasOwn(body, 'name')) {
    const name = normalizeListName(body.name)
    if (name === null) return { error: 'Name must be 1 to 100 characters' }
    changes.name = name
  }
  if (Object.hasOwn(body, 'budget')) {
    const budget = validateMoney(body.budget, 'Budget')
    if (budget && typeof budget === 'object') return budget
    changes.budget = budget
  }
  return changes
}

export function validateListQuery(query) {
  const rawLimit = query.limit ?? '50'
  if (!/^(?:[1-9]|[1-9]\d|100)$/.test(String(rawLimit))) return { error: 'Limit must be between 1 and 100' }
  if (query.cursor === undefined) return { limit: Number(rawLimit), cursor: null }
  try {
    const cursor = query.cursor
    if (typeof cursor !== 'string' || cursor.length > 512) throw new Error()
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (!decoded || typeof decoded.updatedAt !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.(?:\d{3}|\d{6})Z$/.test(decoded.updatedAt) ||
        new Date(decoded.updatedAt).toISOString() !== decoded.updatedAt.replace(/(\.\d{3})\d{3}Z$/, '$1Z')) throw new Error()
    const id = parseListId(String(decoded.id))
    if (id === null) throw new Error()
    return { limit: Number(rawLimit), cursor: { updatedAt: decoded.updatedAt, id: String(id) } }
  } catch { return { error: 'Invalid list cursor' } }
}
