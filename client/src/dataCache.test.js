import assert from 'node:assert/strict'
import test from 'node:test'
import { createDataCache, cacheCompletedTrip, mergeHistoryPage } from './dataCache.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('deduplicates concurrent reads and serves fresh data until staleTime expires', async () => {
  let now = 100
  const cache = createDataCache({ now: () => now })
  const request = deferred()
  let calls = 0
  const fetcher = () => { calls++; return request.promise }
  const first = cache.load('catalog', fetcher, { staleTime: 20 })
  const second = cache.load('catalog', fetcher, { staleTime: 20 })
  assert.equal(calls, 0) // fetcher starts in the next microtask
  await Promise.resolve()
  assert.equal(calls, 1)
  request.resolve(['milk'])
  assert.deepEqual(await first, ['milk'])
  assert.deepEqual(await second, ['milk'])
  now = 119
  assert.deepEqual(await cache.load('catalog', fetcher, { staleTime: 20 }), ['milk'])
  assert.equal(calls, 1)
  now = 120
  const refresh = deferred()
  const loading = cache.load('catalog', () => { calls++; return refresh.promise }, { staleTime: 20 })
  await Promise.resolve()
  assert.equal(calls, 2)
  assert.deepEqual(cache.get('catalog').data, ['milk'])
  refresh.resolve(['milk', 'rice'])
  assert.deepEqual(await loading, ['milk', 'rice'])
  cache.dispose()
})

test('retains stale data when revalidation fails and exposes the error for retry', async () => {
  let now = 50
  const cache = createDataCache({ now: () => now })
  cache.set('cart', { items: ['eggs'] })
  now += 100
  const failure = new Error('offline')
  await assert.rejects(cache.load('cart', () => Promise.reject(failure), { staleTime: 1 }), failure)
  assert.deepEqual(cache.get('cart').data, { items: ['eggs'] })
  assert.equal(cache.get('cart').error, failure)
  assert.equal(cache.get('cart').fetching, false)
  await cache.load('cart', () => Promise.resolve({ items: ['eggs', 'milk'] }), { staleTime: 1 })
  assert.deepEqual(cache.get('cart').data.items, ['eggs', 'milk'])
  assert.equal(cache.get('cart').error, null)
  cache.dispose()
})

test('mutation lock blocks reads and its version prevents an older GET from overwriting the mutation', async () => {
  const cache = createDataCache()
  const request = deferred()
  const pending = cache.load('catalog', () => request.promise)
  await Promise.resolve()
  const unlock = cache.beginMutation('catalog')
  cache.set('catalog', ['optimistic'])
  assert.deepEqual(await cache.load('catalog', () => { throw new Error('locked read ran') }), ['optimistic'])
  request.resolve(['stale server result'])
  assert.deepEqual(await pending, ['optimistic'])
  assert.deepEqual(cache.get('catalog').data, ['optimistic'])
  unlock()
  cache.dispose()
})

test('dispose ignores late completions and aborts in-flight fetch signals', async () => {
  const cache = createDataCache()
  const request = deferred()
  let signal
  const pending = cache.load('trips', (receivedSignal) => { signal = receivedSignal; return request.promise })
  await Promise.resolve()
  cache.dispose()
  assert.equal(signal.aborted, true)
  request.resolve({ items: ['late'] })
  assert.equal(await pending, undefined)
  assert.equal(cache.alive, false)
  assert.equal(cache.get('trips').data, undefined)
})

test('bounds inactive trip detail entries and keeps active detail entries', async () => {
  const cache = createDataCache({ detailLimit: 2 })
  const unsubscribe = cache.subscribe('trip:active', () => {})
  cache.set('trip:active', { trip: { id: 'active' } })
  cache.set('trip:older', { trip: { id: 'older' } })
  cache.set('trip:newer', { trip: { id: 'newer' } })
  assert.ok(cache.get('trip:active').data)
  assert.equal(cache.get('trip:older').data, undefined)
  assert.ok(cache.get('trip:newer').data)
  unsubscribe()
  cache.dispose()
})

test('completed trip updates detail and list summary while preserving cached pagination', () => {
  const cache = createDataCache()
  cache.set('trips', { items: [{ id: 'old', itemCount: 1 }], hasMorePages: true, nextCursor: 'next' })
  const trip = { id: 'done', completedAt: '2026-01-01T00:00:00Z', items: [{ bought: true }, { bought: false }], currency: 'PHP', summary: {} }
  cacheCompletedTrip(cache, trip)
  assert.deepEqual(cache.get('trip:done').data, { trip })
  assert.deepEqual(cache.get('trips').data.items.map((entry) => entry.id), ['done', 'old'])
  assert.equal(cache.get('trips').data.items[0].itemCount, 2)
  assert.equal(cache.get('trips').data.items[0].boughtCount, 1)
  assert.equal(cache.get('trips').data.hasMorePages, true)
  cache.dispose()
})

test('history refresh resets a loaded tail when the refreshed first page is disjoint', () => {
  const previous = { items: [{ id: 'old-3' }, { id: 'old-2' }, { id: 'old-1' }], nextCursor: 'older-cursor', hasLoadedTail: true, hasMorePages: true }
  const fresh = { items: [{ id: 'new-3' }, { id: 'new-2' }], nextCursor: 'new-cursor', hasMorePages: true }
  assert.equal(mergeHistoryPage(previous, fresh), fresh)
})

test('history refresh preserves a loaded tail when its oldest refreshed row bridges into it', () => {
  const previous = { items: [{ id: 'trip-100' }, { id: 'trip-90' }, { id: 'trip-80' }], nextCursor: 'older-cursor', hasLoadedTail: true, hasMorePages: true }
  const fresh = { items: [{ id: 'trip-110' }, { id: 'trip-100' }], nextCursor: 'fresh-cursor', hasMorePages: true }
  assert.deepEqual(mergeHistoryPage(previous, fresh), {
    ...fresh,
    items: [{ id: 'trip-110' }, { id: 'trip-100' }, { id: 'trip-90' }, { id: 'trip-80' }],
    nextCursor: 'older-cursor',
    hasLoadedTail: true,
  })
})

test('an isolated newest overlap does not preserve a tail with missing intervening trips', () => {
  const previous = { items: [{ id: 'trip-126' }, ...Array.from({ length: 40 }, (_, index) => ({ id: `trip-${100 - index}` }))], nextCursor: 'cursor-after-61', hasLoadedTail: true, hasMorePages: true }
  const fresh = { items: Array.from({ length: 20 }, (_, index) => ({ id: `trip-${126 - index}` })), nextCursor: 'fresh-cursor', hasMorePages: true }
  assert.equal(mergeHistoryPage(previous, fresh), fresh)
})
