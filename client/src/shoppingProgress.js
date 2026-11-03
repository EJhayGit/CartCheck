export function getShoppingProgress(items, hidePurchased = false) {
  const purchasedCount = items.reduce((count, item) => count + (item.bought === true ? 1 : 0), 0)
  return {
    remainingCount: items.length - purchasedCount,
    purchasedCount,
    visibleItems: hidePurchased ? items.filter((item) => item.bought !== true) : items,
  }
}

// The server stores quantities as fixed three-decimal strings; show 1.500 as 1.5 and 2.000 as 2.
export function formatQuantity(item) {
  const amount = String(item.quantity).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1')
  return item.unitLabel ? `${amount} ${item.unitLabel}` : amount
}

export const isWholeQuantity = (quantity) => /^\d+(\.0+)?$/.test(String(quantity))

// The next whole quantity, or null when stepping does not apply. quantity is NUMERIC(12, 3), so 9 whole digits at most.
export function stepQuantity(quantity, delta) {
  const next = Number(quantity) + delta
  return isWholeQuantity(quantity) && next >= 1 && next <= 999999999 ? String(next) : null
}

// A plain quantity of one says nothing, so list rows leave it out.
export const listRowQuantity = (item) => Number(item.quantity) === 1 && !item.unitLabel ? '' : formatQuantity(item)

export function sortShoppingItems(items, mode = 'default') {
  const sorted = [...items]
  if (mode === 'az') sorted.sort((a, b) => a.name.localeCompare(b.name))
  if (mode === 'category') sorted.sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name))
  if (mode === 'unpurchased') sorted.sort((a, b) => Number(a.bought === true) - Number(b.bought === true))
  if (mode === 'purchased') sorted.sort((a, b) => Number(b.bought === true) - Number(a.bought === true))
  return sorted
}
