export function getShoppingProgress(items, hidePurchased = false) {
  const purchasedCount = items.reduce((count, item) => count + (item.bought === true ? 1 : 0), 0)
  return {
    remainingCount: items.length - purchasedCount,
    purchasedCount,
    visibleItems: hidePurchased ? items.filter((item) => item.bought !== true) : items,
  }
}

export function sortShoppingItems(items, mode = 'default') {
  const sorted = [...items]
  if (mode === 'az') sorted.sort((a, b) => a.name.localeCompare(b.name))
  if (mode === 'category') sorted.sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name))
  if (mode === 'unpurchased') sorted.sort((a, b) => Number(a.bought === true) - Number(b.bought === true))
  if (mode === 'purchased') sorted.sort((a, b) => Number(b.bought === true) - Number(a.bought === true))
  return sorted
}
