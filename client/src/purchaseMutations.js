import { replaceListSummary } from './dataCache.js'

// A coordinator belongs to a cache/list for its full session lifetime. A view
// remount can attach new callbacks, but cannot start a competing writer.
const coordinators = new WeakMap()
const coordinatorFor = (cache, listId = 'cart') => coordinators.get(cache)?.get(String(listId))
export const purchaseIntentVersion = (cache, id, listId = 'cart') => coordinatorFor(cache, listId)?.versions.get(id) || 0
export const hasPurchaseMutation = (cache, id, listId = 'cart') => coordinatorFor(cache, listId)?.pending.has(id) || false

export function mergePendingListResponse(cache, listId, serverList) {
  if (!serverList) return serverList
  const key = String(listId)
  const cacheKey = `list:${key}`
  const current = cache.get(cacheKey).data
  const authoritative = current && Number(current.revision) > Number(serverList.revision) ? current : serverList
  const pending = coordinatorFor(cache, key)?.pending
  if (!pending?.size) return authoritative
  return { ...authoritative, items: authoritative.items.map((item) => {
    const state = pending.get(item.id)
    return state ? { ...item, bought: state.desired } : item
  }) }
}

export function createPurchaseMutations(cache, persist, { onPending = () => {}, onError = () => {}, listId = 'cart' } = {}) {
  const key = String(listId)
  const cacheKey = key === 'cart' ? 'cart' : `list:${key}`
  const registered = coordinators.get(cache) || new Map()
  let coordinator = registered.get(key)
  if (!coordinator) {
    coordinator = { pending: new Map(), versions: new Map(), listeners: new Set(), reconciliationNeeded: false, drain: null }
    registered.set(key, coordinator)
    coordinators.set(cache, registered)
  }
  const callbacks = { onPending, onError }
  const subscribe = () => {
    coordinator.listeners.add(callbacks)
    callbacks.onPending(coordinator.pending.size)
    return () => coordinator.listeners.delete(callbacks)
  }
  function notifyPending() {
    for (const listener of coordinator.listeners) listener.onPending(coordinator.pending.size)
  }
  function reportError(message) {
    for (const listener of coordinator.listeners) listener.onError(message)
  }
  function apply(id, bought, serverList = null) {
    const current = cache.get(cacheKey).data
    if (serverList) {
      cache.set(cacheKey, mergePendingListResponse(cache, key, serverList))
    } else {
      cache.set(cacheKey, (list) => list && { ...list, items: list.items.map((item) => item.id === id ? { ...item, bought } : item) })
    }
    if (key !== 'cart') replaceListSummary(cache, cache.get(cacheKey).data || current)
  }
  async function drain(id, state) {
    try {
      do {
        const version = state.version
        const desired = state.desired
        try {
          const result = await persist(id, { bought: desired })
          if (!cache.alive) return
          state.confirmed = result.item.bought
          // Parent revision/timestamp and other server fields are refreshed,
          // while every in-flight local item intent remains authoritative.
          apply(id, state.version === version ? state.confirmed : state.desired, result.list)
        } catch {
          if (!cache.alive) return
          if (state.version === version) {
            apply(id, state.confirmed)
            coordinator.reconciliationNeeded = true
            cache.invalidate(cacheKey)
            reportError("Couldn't save that change. Please try again.")
          }
        }
        if (state.version === version) break
      } while (cache.alive)
    } finally {
      coordinator.pending.delete(id)
      state.release()
      if (cache.alive && !coordinator.pending.size && coordinator.reconciliationNeeded) {
        cache.invalidate(cacheKey)
        coordinator.reconciliationNeeded = false
      }
      if (cache.alive) notifyPending()
    }
  }
  const api = {
    get size() { return coordinator.pending.size },
    has: (id) => coordinator.pending.has(id),
    subscribe,
    set(id, bought) {
      if (!cache.alive) return
      const item = cache.get(cacheKey).data?.items.find((entry) => entry.id === id)
      if (!item) return
      coordinator.versions.set(id, (coordinator.versions.get(id) || 0) + 1)
      let state = coordinator.pending.get(id)
      if (state) {
        state.desired = bought
        state.version += 1
        apply(id, bought)
        return
      }
      state = { desired: bought, confirmed: item.bought, version: 1, release: cache.beginMutation(cacheKey) }
      coordinator.pending.set(id, state)
      apply(id, bought)
      notifyPending()
      if (!coordinator.drain) coordinator.drain = drain
      void drain(id, state)
    },
  }
  return api
}
