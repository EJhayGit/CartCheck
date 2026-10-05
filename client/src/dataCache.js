import { moneySummary } from './money.js'

// In-memory only. A new authenticated session owns a new store.
const EMPTY = Object.freeze({ data: undefined, error: null, fetching: false, updatedAt: 0 })

export function createDataCache({ now = Date.now, detailLimit = 30 } = {}) {
  const entries = new Map()
  let alive = true
  function entry(key) {
    if (!entries.has(key)) entries.set(key, { snapshot: EMPTY, listeners: new Set(), version: 0, locks: 0, controller: null, promise: null })
    return entries.get(key)
  }
  function publish(resource, changes) {
    resource.snapshot = { ...resource.snapshot, ...changes }
    for (const listener of resource.listeners) listener()
  }
  function cancel(resource) {
    resource.version += 1
    resource.controller?.abort()
    resource.controller = null
    resource.promise = null
  }
  function trimDetails() {
    const details = [...entries].filter(([key]) => key.startsWith('trip:') || key.startsWith('list:'))
    let remaining = details.length
    for (const [key, resource] of details) {
      if (remaining <= detailLimit) break
      if (!resource.listeners.size && !resource.promise && !resource.locks) {
        entries.delete(key)
        remaining -= 1
      }
    }
  }
  const cache = {
    get alive() { return alive },
    revalidateSubscribedDetails() {
      for (const [key, resource] of entries) {
        if ((key.startsWith('list:') || key.startsWith('trip:')) && resource.listeners.size && resource.fetcher) cache.load(key, resource.fetcher, { force: true }).catch(() => {})
      }
    },
    get: (key) => entry(key).snapshot,
    subscribe(key, listener) {
      const resource = entry(key)
      resource.listeners.add(listener)
      return () => { resource.listeners.delete(listener); trimDetails() }
    },
    set(key, value) {
      if (!alive) return
      const resource = entry(key)
      const data = typeof value === 'function' ? value(resource.snapshot.data) : value
      cancel(resource)
      publish(resource, { data, error: null, fetching: false, updatedAt: now() })
      trimDetails()
    },
    invalidate(key) {
      if (!alive) return
      const resource = entry(key)
      cancel(resource)
      publish(resource, { updatedAt: 0, fetching: false })
    },
    beginMutation(key) {
      const resource = entry(key)
      cancel(resource)
      resource.locks += 1
      publish(resource, { fetching: false })
      let released = false
      return () => {
        if (released) return
        released = true
        resource.locks -= 1
      }
    },
    load(key, fetcher, { staleTime = 30_000, force = false } = {}) {
      if (!alive) return Promise.reject(new DOMException('Session ended', 'AbortError'))
      const resource = entry(key)
      if (resource.locks) return Promise.resolve(resource.snapshot.data)
      if (resource.promise) return resource.promise
      if (!force && resource.snapshot.data !== undefined && resource.snapshot.updatedAt > 0 && now() - resource.snapshot.updatedAt < staleTime) return Promise.resolve(resource.snapshot.data)
      const version = ++resource.version
      const controller = new AbortController()
      resource.controller = controller
      resource.fetcher = fetcher
      publish(resource, { fetching: true, error: null })
      const promise = Promise.resolve().then(() => fetcher(controller.signal)).then((data) => {
        if (!alive || resource.version !== version) return resource.snapshot.data
        publish(resource, { data, error: null, updatedAt: now() })
        trimDetails()
        return data
      }).catch((error) => {
        if (alive && resource.version === version && error.name !== 'AbortError') publish(resource, { error })
        if (!alive || resource.version !== version) return resource.snapshot.data
        throw error
      }).finally(() => {
        if (alive && resource.version === version) {
          resource.promise = null
          resource.controller = null
          publish(resource, { fetching: false })
          trimDetails()
        }
      })
      resource.promise = promise
      return promise
    },
    dispose() {
      alive = false
      for (const resource of entries.values()) { cancel(resource); resource.listeners.clear() }
      entries.clear()
    },
  }
  return cache
}

export function tripSummary(trip) {
  const { items, ...summary } = trip
  const boughtCount = items.filter((item) => item.bought).length
  return { ...summary, itemCount: items.length, boughtCount, notBoughtCount: items.length - boughtCount }
}

export function listSummary(list) {
  const hasItems = Array.isArray(list.items)
  const { items = [], ...summary } = list
  const boughtCount = items.filter((item) => item.bought).length
  const amounts = hasItems ? moneySummary(items) : null
  return { ...summary, id: list.tripId ?? list.id,
    itemCount: hasItems ? items.length : list.itemCount ?? list.summary?.itemCount ?? 0,
    boughtCount: hasItems ? boughtCount : list.boughtCount ?? list.summary?.boughtCount ?? 0,
    notBoughtCount: hasItems ? items.length - boughtCount : list.notBoughtCount ?? list.summary?.notBoughtCount ?? 0,
    summary: amounts ? { estimatedTotal: amounts.estimated.knownCount ? amounts.estimated.total : null, estimatedMissingCount: amounts.estimated.missingCount, actualTotal: amounts.actual.knownCount ? amounts.actual.total : null, actualMissingCount: amounts.actual.missingCount } : list.summary }
}

export function replaceListSummary(cache, list) {
  const summary = listSummary(list)
  // A detail write must not manufacture a one-row overview when the full
  // paginated summary has not loaded yet. That would discard other lists and
  // cancel an in-flight overview request.
  if (cache.get('lists').data === undefined) {
    // The response may have been requested before this detail mutation. Drop
    // that cold read so the next overview mount fetches current summaries.
    cache.invalidate('lists')
    return
  }
  cache.set('lists', (current) => {
    if (!current) return current
    const found = current.items.some((item) => String(item.id) === String(list.tripId ?? list.id))
    return { ...current, items: found
      ? current.items.map((item) => String(item.id) === String(list.tripId ?? list.id) ? { ...item, ...summary } : item)
      : [summary, ...current.items] }
  })
}

export function removeListSummary(cache, id) {
  cache.set('lists', (current) => current && ({ ...current, items: current.items.filter((item) => String(item.id) !== String(id)) }))
}

export function cacheCompletedTrip(cache, trip) {
  cache.set(`trip:${trip.id}`, { trip })
  cache.set('trips', (current) => {
    if (!current) return current
    const summary = tripSummary(trip)
    return { ...current, items: [summary, ...current.items.filter((item) => String(item.id) !== String(trip.id))] }
  })
  if (cache.get('trips').data === undefined) cache.invalidate('trips')
}

export function mergeHistoryPage(previous, first) {
  if (!previous?.hasLoadedTail) return first
  const ids = new Set(first.items.map((trip) => String(trip.id)))
  // The oldest refreshed row must bridge into the loaded chain. A locally
  // inserted newest summary alone cannot prove that intervening rows exist.
  const boundary = first.items.at(-1)?.id
  if (boundary === undefined || !previous.items.some((trip) => String(trip.id) === String(boundary))) return first
  return { ...first, items: [...first.items, ...previous.items.filter((trip) => !ids.has(String(trip.id)))], nextCursor: previous.nextCursor, hasLoadedTail: true }
}
