import { replaceListSummary } from './dataCache.js'

// A coordinator belongs to a cache/list for its full session lifetime. A view
// remount can attach new callbacks, but cannot start a competing writer.
const coordinators = new WeakMap()
// One optimistic field per coordinator; bought and quantity on one item save independently.
const FIELDS = ['bought', 'quantity']
const coordinatorFor = (cache, listId = 'cart', field = 'bought') => coordinators.get(cache)?.get(`${listId}:${field}`)
export const purchaseIntentVersion = (cache, id, listId = 'cart') => coordinatorFor(cache, listId)?.versions.get(id) || 0
export const hasPurchaseMutation = (cache, id, listId = 'cart') => coordinatorFor(cache, listId)?.pending.has(id) || false

export function mergePendingListResponse(cache, listId, serverList) {
  if (!serverList) return serverList
  const key = String(listId)
  const cacheKey = `list:${key}`
  const current = cache.get(cacheKey).data
  const authoritative = current && Number(current.revision) > Number(serverList.revision) ? current : serverList
  const pending = FIELDS.map((field) => [field, coordinatorFor(cache, key, field)?.pending]).filter(([, states]) => states?.size)
  if (!pending.length) return authoritative
  return { ...authoritative, items: authoritative.items.map((item) => {
    let merged = item
    for (const [field, states] of pending) {
      const state = states.get(item.id)
      if (state) merged = { ...merged, [field]: state.desired }
    }
    return merged
  }) }
}

export function createPurchaseMutations(cache, persist, { onPending = () => {}, onError = () => {}, listId = 'cart', field = 'bought' } = {}) {
  const key = String(listId)
  const cacheKey = key === 'cart' ? 'cart' : `list:${key}`
  const registered = coordinators.get(cache) || new Map()
  let coordinator = registered.get(`${key}:${field}`)
  if (!coordinator) {
    coordinator = { pending: new Map(), versions: new Map(), listeners: new Set(), reconciliationNeeded: false, drain: null }
    registered.set(`${key}:${field}`, coordinator)
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
  function apply(id, value, serverList = null) {
    const current = cache.get(cacheKey).data
    if (serverList) {
      cache.set(cacheKey, mergePendingListResponse(cache, key, serverList))
    } else {
      cache.set(cacheKey, (list) => list && { ...list, items: list.items.map((item) => item.id === id ? { ...item, [field]: value } : item) })
    }
    if (key !== 'cart') replaceListSummary(cache, cache.get(cacheKey).data || current)
  }
  async function drain(id, state) {
    try {
      do {
        const version = state.version
        const desired = state.desired
        try {
          const result = await persist(id, { [field]: desired })
          if (!cache.alive) return
          state.confirmed = result.item[field]
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
    set(id, value) {
      if (!cache.alive) return
      const item = cache.get(cacheKey).data?.items.find((entry) => entry.id === id)
      if (!item) return
      coordinator.versions.set(id, (coordinator.versions.get(id) || 0) + 1)
      let state = coordinator.pending.get(id)
      if (state) {
        state.desired = value
        state.version += 1
        apply(id, value)
        return
      }
      state = { desired: value, confirmed: item[field], version: 1, release: cache.beginMutation(cacheKey) }
      coordinator.pending.set(id, state)
      apply(id, value)
      notifyPending()
      if (!coordinator.drain) coordinator.drain = drain
      void drain(id, state)
    },
  }
  return api
}
