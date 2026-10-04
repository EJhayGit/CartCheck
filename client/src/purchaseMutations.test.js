import test from 'node:test'
import assert from 'node:assert/strict'
import { createDataCache } from './dataCache.js'
import { createPurchaseMutations } from './purchaseMutations.js'

const tick = () => new Promise((resolve) => setImmediate(resolve))
function fixture() {
  const cache = createDataCache()
  cache.set('cart', { items: Array.from({ length: 10 }, (_, id) => ({ id: String(id), bought: false, name: `Item ${id}` })) })
  const requests = []
  const errors = []
  const mutations = createPurchaseMutations(cache, (id, changes) => new Promise((resolve, reject) => requests.push({ id, changes, resolve, reject })), { onError: (message) => errors.push(message) })
  return { cache, requests, errors, mutations, bought: (id = '0') => cache.get('cart').data.items.find((item) => item.id === id).bought }
}

test('ten items update synchronously and issue independent writes; reverse responses preserve all items', async () => {
  const f = fixture()
  for (let id = 0; id < 10; id++) f.mutations.set(String(id), true)
  assert.equal(f.requests.length, 10)
  assert.ok(f.cache.get('cart').data.items.every((item) => item.bought))
  let reads = 0
  await f.cache.load('cart', () => { reads++; return {} }, { force: true })
  assert.equal(reads, 0, 'background reads cannot replace optimistic data')
  for (const request of [...f.requests].reverse()) request.resolve({ item: { bought: true } })
  await tick()
  assert.equal(f.mutations.size, 0)
  assert.ok(f.cache.get('cart').data.items.every((item) => item.bought))
})

test('rapid same-item intent coalesces and cannot be overwritten by an earlier success', async () => {
  const f = fixture()
  for (const value of [true, false, true, false]) f.mutations.set('0', value)
  assert.equal(f.requests.length, 1)
  assert.equal(f.bought(), false)
  f.requests[0].resolve({ item: { bought: true } })
  await tick()
  assert.equal(f.bought(), false)
  assert.equal(f.requests.length, 2)
  assert.deepEqual(f.requests[1].changes, { bought: false })
  f.requests[1].resolve({ item: { bought: false } })
  await tick()
  assert.equal(f.bought(), false)
})

test('an older failure does not roll back newer intent; latest failure restores last confirmed value', async () => {
  const f = fixture()
  f.mutations.set('0', true)
  f.mutations.set('0', false)
  f.requests[0].reject(new Error('offline'))
  await tick()
  assert.equal(f.bought(), false)
  assert.equal(f.errors.length, 0)
  f.requests[1].resolve({ item: { bought: false } })
  await tick()
  f.mutations.set('0', true)
  f.requests[2].reject(new Error('offline'))
  await tick()
  assert.equal(f.bought(), false)
  assert.equal(f.errors.length, 1)
  assert.equal(f.cache.get('cart').updatedAt, 0)
})

test('responses merge only purchase status and disposed sessions are never changed', async () => {
  const f = fixture()
  f.mutations.set('0', true)
  f.cache.set('cart', (cart) => ({ ...cart, items: cart.items.map((item) => item.id === '0' ? { ...item, name: 'Latest name' } : item) }))
  f.requests[0].resolve({ item: { bought: true, name: 'Stale name' } })
  await tick()
  assert.equal(f.cache.get('cart').data.items[0].name, 'Latest name')
  f.mutations.set('1', true)
  f.cache.dispose()
  f.requests[1].resolve({ item: { bought: true } })
  await tick()
  assert.equal(f.cache.get('cart').data, undefined)
})

test('a different item succeeding after a failure cannot erase reconciliation staleness', async () => {
  const f = fixture()
  f.mutations.set('0', true)
  f.mutations.set('1', true)
  f.requests[0].reject(new Error('connection lost'))
  await tick()
  f.requests[1].resolve({ item: { bought: true } })
  await tick()
  assert.equal(f.bought('0'), false)
  assert.equal(f.bought('1'), true)
  assert.equal(f.cache.get('cart').updatedAt, 0)
})
