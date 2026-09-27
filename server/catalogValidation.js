export const CATALOG_CATEGORIES = Object.freeze([
  'Produce',
  'Dairy & eggs',
  'Meat & seafood',
  'Bakery',
  'Pantry',
  'Frozen',
  'Snacks',
  'Beverages',
  'Household',
  'Other',
])

const MAX_SEARCH_LENGTH = 100
const MAX_NAME_LENGTH = 120

export function validateCatalogQuery(query) {
  const searchValue = query?.search
  const categoryValue = query?.category
  if (searchValue !== undefined && typeof searchValue !== 'string') {
    return { error: 'Search must be text' }
  }
  if (categoryValue !== undefined && typeof categoryValue !== 'string') {
    return { error: 'Choose an approved category' }
  }

  const search = (searchValue ?? '').trim()
  const category = (categoryValue ?? '').trim()
  if (search.length > MAX_SEARCH_LENGTH) return { error: 'Search is too long' }
  if (category && !CATALOG_CATEGORIES.includes(category)) {
    return { error: 'Choose an approved category' }
  }
  return { search, category: category || null }
}

export function validateCatalogInput(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Provide a catalog item' }
  }
  const keys = Object.keys(body)
  if (keys.some((key) => !['name', 'category'].includes(key))) {
    return { error: 'Only name and category can be changed' }
  }
  if (!partial && (!Object.hasOwn(body, 'name') || !Object.hasOwn(body, 'category'))) {
    return { error: 'Name and category are required' }
  }
  if (partial && keys.length === 0) return { error: 'Provide a field to update' }

  const values = {}
  if (Object.hasOwn(body, 'name')) {
    if (typeof body.name !== 'string') return { error: 'Name must be text' }
    const name = body.name.trim()
    if (name.length < 1 || name.length > MAX_NAME_LENGTH) {
      return { error: 'Name must be 1 to 120 characters' }
    }
    values.name = name
  }
  if (Object.hasOwn(body, 'category')) {
    if (typeof body.category !== 'string' || !CATALOG_CATEGORIES.includes(body.category)) {
      return { error: 'Choose an approved category' }
    }
    values.category = body.category
  }
  return values
}

export function parseCatalogId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,15}$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}
