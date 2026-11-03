// 0 exact (a simple plural counts: "banana" means Bananas), 1 name start, 2 word start, 3 substring, -1 no match.
export function matchTier(productName, rawTerm) {
  const name = productName.toLocaleLowerCase()
  const term = rawTerm.trim().toLocaleLowerCase()
  if (name === term || name === `${term}s` || name === `${term}es`) return 0
  if (name.startsWith(term)) return 1
  if ([...name.matchAll(/[\p{L}\p{N}]+/gu)].some((word) => name.startsWith(term, word.index))) return 2
  return name.includes(term) ? 3 : -1
}

export function rankSuggestions(products, rawTerm, boughtBefore = new Set()) {
  const term = rawTerm.trim().toLocaleLowerCase()
  if (!term) return []
  const onLastTrip = (product) => Number(boughtBefore.has(String(product.id)))
  return products
    .map((product) => ({ product, tier: matchTier(product.name, term) }))
    .filter(({ tier }) => tier >= 0)
    .sort((a, b) => a.tier - b.tier || onLastTrip(b.product) - onLastTrip(a.product) || a.product.name.localeCompare(b.product.name))
    .map(({ product }) => product)
}

// Commas or line breaks in the find field mean several items.
export const isItemList = (raw) => /[,\n]/.test(raw)

export function parseItemList(raw) {
  const seen = new Set()
  return raw.split(/[,\n]/).map((name) => name.trim()).filter((name) => {
    const key = name.toLocaleLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const sameItem = (a, b) => matchTier(a, b) === 0 || matchTier(b, a) === 0

// Stricter than Enter on one term: only exact or simple-plural matches reuse a catalog item, so "ham" never adds Hamburger buns.
export function resolveItemList(names, products, onListIds, pendingNames = []) {
  const entries = []
  const skipped = []
  for (const name of names) {
    const product = products.find((candidate) => matchTier(candidate.name, name) === 0)
    const repeated = entries.some((entry) => product ? entry.product?.id === product.id : sameItem(entry.name, name))
    if (repeated) continue
    if ((product && onListIds.has(String(product.id))) || pendingNames.some((pending) => sameItem(pending, name))) skipped.push(name)
    else entries.push({ name: product?.name ?? name, product: product ?? null })
  }
  return { entries, skipped }
}
