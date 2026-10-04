// One writer per item, independent writers across items. Intermediate clicks
// coalesce while a write is in flight; no later write can reach the server first.
const coordinators = new WeakMap()
export const purchaseIntentVersion = (cache, id) => coordinators.get(cache)?.versions.get(id) || 0
export const hasPurchaseMutation = (cache, id) => coordinators.get(cache)?.pending.has(id) || false

export function createPurchaseMutations(cache, persist, { onPending = () => {}, onError = () => {} } = {}) {
  const pending = new Map()
  const versions = new Map()
  let reconciliationNeeded = false
  coordinators.set(cache, { pending, versions })
  const update = (id, bought) => cache.set('cart', (cart) => cart && {
    ...cart, items: cart.items.map((item) => item.id === id ? { ...item, bought } : item),
  })
  async function drain(id, state) {
    try {
      do {
        const version = state.version
        const desired = state.desired
        try {
          const result = await persist(id, { bought: desired })
          if (!cache.alive) return
          state.confirmed = result.item.bought
          // Merge only the field this mutation owns, retaining other local edits.
          if (state.version === version) update(id, state.confirmed)
        } catch {
          if (!cache.alive) return
          // An older failure must never undo a more recent click.
          if (state.version === version) {
            update(id, state.confirmed)
            reconciliationNeeded = true
            cache.invalidate('cart')
            onError("Couldn't save that change. Please try again.")
          }
        }
        if (state.version === version) break
      } while (cache.alive)
    } finally {
      pending.delete(id)
      state.release()
      if (cache.alive && !pending.size && reconciliationNeeded) {
        // Another item's success may have refreshed updatedAt after a failure.
        // Keep the failed batch stale so the next read can reconcile uncertainty.
        cache.invalidate('cart')
        reconciliationNeeded = false
      }
      if (cache.alive) onPending(pending.size)
    }
  }
  return {
    get size() { return pending.size },
    has: (id) => pending.has(id),
    set(id, bought) {
      if (!cache.alive) return
      const item = cache.get('cart').data?.items.find((entry) => entry.id === id)
      if (!item) return
      versions.set(id, (versions.get(id) || 0) + 1)
      let state = pending.get(id)
      if (state) {
        state.desired = bought
        state.version += 1
        update(id, bought)
        return
      }
      state = { desired: bought, confirmed: item.bought, version: 1, release: cache.beginMutation('cart') }
      pending.set(id, state)
      update(id, bought)
      onPending(pending.size)
      void drain(id, state)
    },
  }
}
