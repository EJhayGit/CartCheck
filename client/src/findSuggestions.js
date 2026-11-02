// 0 exact (a simple plural counts: "banana" means Bananas), 1 name start, 2 word start, 3 substring, -1 no match.
function matchTier(name, term) {
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
    .map((product) => ({ product, tier: matchTier(product.name.toLocaleLowerCase(), term) }))
    .filter(({ tier }) => tier >= 0)
    .sort((a, b) => a.tier - b.tier || onLastTrip(b.product) - onLastTrip(a.product) || a.product.name.localeCompare(b.product.name))
    .map(({ product }) => product)
}
