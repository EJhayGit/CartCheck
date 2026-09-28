export function getShoppingProgress(items, hidePurchased = false) {
  const purchasedCount = items.reduce((count, item) => count + (item.bought === true ? 1 : 0), 0)
  return {
    remainingCount: items.length - purchasedCount,
    purchasedCount,
    visibleItems: hidePurchased ? items.filter((item) => item.bought !== true) : items,
  }
}
