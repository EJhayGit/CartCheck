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
  const detach = mutations.subscribe()
  return { cache, requests, errors, mutations, detach, bought: (id = '0') => cache.get('cart').data.items.find((item) => item.id === id).bought }
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

test('a list purchase writer survives detail remounts and scopes same item IDs by list', async () => {
  const cache = createDataCache()
  const one = { tripId: 'one', revision: 1, items: [{ id: 'same-item', bought: false, name: 'Milk' }] }
  const two = { tripId: 'two', revision: 1, items: [{ id: 'same-item', bought: false, name: 'Milk' }] }
  cache.set('list:one', one)
  cache.set('list:two', two)
  cache.set('lists', { items: [one, two] })
  const writes = []
  const persist = (id, changes) => new Promise((resolve) => writes.push({ id, changes, resolve }))
  const firstView = createPurchaseMutations(cache, persist, { listId: 'one' })
  const detachFirst = firstView.subscribe()
  firstView.set('same-item', true)
  detachFirst()
  const remountedView = createPurchaseMutations(cache, persist, { listId: 'one' })
  const detachSecond = remountedView.subscribe()
  remountedView.set('same-item', false)
  assert.equal(writes.length, 1, 'the remount reuses the original in-flight writer')
  assert.equal(cache.get('list:one').data.items[0].bought, false)
  assert.equal(cache.get('list:two').data.items[0].bought, false)

  writes[0].resolve({ item: { bought: true }, list: { ...one, revision: 2, items: [{ ...one.items[0], bought: true }] } })
  await tick()
  assert.equal(writes.length, 2)
  assert.deepEqual(writes.map((write) => write.changes), [{ bought: true }, { bought: false }])
  writes[1].resolve({ item: { bought: false }, list: { ...one, revision: 3, items: [{ ...one.items[0], bought: false }] } })
  await tick()
  assert.equal(cache.get('list:one').data.items[0].bought, false)
  assert.equal(cache.get('list:two').data.items[0].bought, false)
  detachSecond()
})

test('older list purchase responses preserve newer parent membership and revision', async () => {
  const cache = createDataCache()
  const current = { tripId: 'list-1', revision: 4, items: [{ id: 'one', bought: false }, { id: 'new-item', bought: false }] }
  cache.set('list:list-1', current)
  let resolveWrite
  const mutations = createPurchaseMutations(cache, () => new Promise((resolve) => { resolveWrite = resolve }), { listId: 'list-1' })
  mutations.set('one', true)
  resolveWrite({ item: { id: 'one', bought: true }, list: { tripId: 'list-1', revision: 3, items: [{ id: 'one', bought: true }] } })
  await tick()
  assert.equal(cache.get('list:list-1').data.revision, 4)
  assert.deepEqual(cache.get('list:list-1').data.items.map((item) => item.id), ['one', 'new-item'])
})
