import assert from 'node:assert/strict'
import test from 'node:test'
import { createDataCache } from './dataCache.js'
import { applyProposal, assistantErrorText, assistantReply, canConfirm, itemLabel, listOptionLabel, loadAllLists, matchBought, resolveProposal, usedUpText } from './assistantActions.js'

const lists = [{ id: '1', name: 'Weekly' }, { id: '2', name: 'Party' }, { id: '3', name: 'Party' }]
const products = [{ id: '10', name: 'Eggs' }, { id: '11', name: 'Rice' }]
const resolve = (action, extra = {}) => resolveProposal([action], { lists, products, currentListId: null, ...extra }).steps[0]

test('a list name matches exactly, ignoring case', () => {
  assert.equal(resolve({ type: 'add_items', listName: 'weekly', items: [{ name: 'rice' }] }).list.listId, '1')
})

test('duplicate list names need a choice instead of a guess', () => {
  const { list } = resolve({ type: 'add_items', listName: 'Party', items: [{ name: 'rice' }] }, { currentListId: '2' })
  assert.equal(list.listId, null)
  assert.deepEqual(list.options.map((option) => option.id), ['2', '3'])
})

test('same-named lists can be told apart in the picker, and others keep their plain name', () => {
  const lists = [
    { id: '2', name: 'Party', summary: { itemCount: 3 }, updatedAt: '2026-11-05T01:00:00.000Z' },
    { id: '3', name: 'party', summary: { itemCount: 1 }, updatedAt: '2026-11-04T01:00:00.000Z' },
    { id: '4', name: 'Weekly', summary: { itemCount: 0 }, updatedAt: '2026-11-04T01:00:00.000Z' },
  ]
  const { options } = resolve({ type: 'add_items', items: [{ name: 'rice' }] }, { lists }).list
  const label = (option) => listOptionLabel(option, options, { formatTime: (date) => date.toISOString().slice(0, 10) })
  assert.deepEqual(options.map(label), ['Party (3 items, updated 2026-11-05)', 'party (1 item, updated 2026-11-04)', 'Weekly'])
})

test('a list that is not found shows every list and names what was asked for', () => {
  const { list } = resolve({ type: 'add_items', listName: 'Market', items: [{ name: 'rice' }] }, { currentListId: '1' })
  assert.equal(list.listId, null)
  assert.equal(list.notFound, 'Market')
  assert.equal(list.options.length, 3)
})

test('no list named defaults to the open list', () => {
  assert.equal(resolve({ type: 'add_items', items: [{ name: 'rice' }] }, { currentListId: '2' }).list.listId, '2')
})

test('no list named and none open needs a choice, without a not-found note', () => {
  const { list } = resolve({ type: 'add_items', items: [{ name: 'rice' }] })
  assert.equal(list.listId, null)
  assert.equal(list.notFound, null)
  assert.equal(list.options.length, 3)
})

test('an open list id that is no longer active is not used', () => {
  assert.equal(resolve({ type: 'add_items', items: [{ name: 'rice' }] }, { currentListId: '99' }).list.listId, null)
})

test('list ids from the API shape are read too', () => {
  const step = resolve({ type: 'add_items', listName: 'Trip', items: [{ name: 'rice' }] }, { lists: [{ tripId: '7', name: 'Trip' }] })
  assert.equal(step.list.listId, '7')
})

test('catalog items reuse exact and simple-plural matches only', () => {
  const step = resolve({ type: 'add_items', listName: 'Weekly', items: [{ name: 'egg', quantity: '2.000' }, { name: 'ric' }] })
  assert.equal(step.items[0].product.id, '10')
  assert.equal(step.items[0].quantity, '2.000')
  assert.equal(step.items[1].product, null)
})

test('matching bought names reports found, already bought and missing', () => {
  const detail = { items: [{ id: 'a', name: 'Eggs', bought: false }, { id: 'b', name: 'Milk', bought: true }] }
  assert.deepEqual(matchBought(['egg', 'milk', 'bread'], detail), {
    found: [{ id: 'a', name: 'Eggs' }], alreadyBought: ['Milk'], missing: ['bread'],
  })
})

test('a bought name matching two items equally is not guessed', () => {
  const detail = { items: [{ id: 'a', name: 'Oat milk', bought: false }, { id: 'b', name: 'Soy milk', bought: false }] }
  assert.deepEqual(matchBought(['milk'], detail).missing, ['milk'])
})

test('a closer match wins over a looser one', () => {
  const detail = { items: [{ id: 'a', name: 'Oat milk', bought: false }, { id: 'b', name: 'Milk', bought: false }] }
  assert.equal(matchBought(['milk'], detail).found[0].id, 'b')
})

test('Confirm needs every list chosen', () => {
  const steps = [{ type: 'add_items', list: { listId: null }, items: [{ name: 'rice' }] }]
  assert.equal(canConfirm({ steps }), false)
  assert.equal(canConfirm({ steps: [{ ...steps[0], list: { listId: '1' } }] }), true)
})

test('Confirm is not offered when nothing bought matched', () => {
  const step = { type: 'mark_bought', list: { listId: '1' }, itemNames: ['x'], match: { found: [], alreadyBought: [], missing: ['x'] } }
  assert.equal(canConfirm({ steps: [step] }), false)
  assert.equal(canConfirm({ steps: [{ ...step, match: { found: [{ id: 'a', name: 'X' }], alreadyBought: [], missing: [] } }] }), true)
})

test('Confirm waits while bought matches are still loading', () => {
  assert.equal(canConfirm({ steps: [{ type: 'mark_bought', list: { listId: '1' }, itemNames: ['x'] }] }), false)
})

test('all pages of lists are loaded, so a repeated name further down is seen', async () => {
  const pages = { null: { items: [{ id: '1' }], nextCursor: 'c2' }, c2: { items: [{ id: '2' }], nextCursor: null } }
  assert.deepEqual((await loadAllLists({ getLists: async (cursor) => pages[cursor] })).map((list) => list.id), ['1', '2'])
})

function detail(id, items = [], revision = 1) { return { tripId: id, name: 'L', currency: 'PHP', revision, items } }

function fakeApi({ fail = () => false } = {}) {
  const calls = []
  let nextId = 100
  const lists = new Map()
  const record = (name, args) => {
    calls.push([name, ...args])
    if (fail(name, args)) throw new Error(`${name} failed`)
  }
  const listFor = (id) => { if (!lists.has(id)) lists.set(id, detail(id)); return lists.get(id) }
  const api = {
    createList: async (input) => { record('createList', [input]); const id = String(nextId++); lists.set(id, { ...detail(id), name: input.name }); return lists.get(id) },
    createCatalogItem: async (input) => { record('createCatalogItem', [input]); return { item: { id: String(nextId++), ...input } } },
    addListItem: async (listId, productId) => {
      record('addListItem', [listId, productId])
      const list = listFor(listId)
      const existing = list.items.find((item) => item.productId === productId)
      if (existing) return { item: existing, created: false, list }
      const item = { id: String(nextId++), productId, bought: false }
      const next = { ...list, revision: list.revision + 1, items: [...list.items, item] }
      lists.set(listId, next)
      return { item, created: true, list: next }
    },
    updateListItem: async (listId, itemId, input) => {
      record('updateListItem', [listId, itemId, input])
      const list = listFor(listId)
      const next = { ...list, revision: list.revision + 1, items: list.items.map((item) => item.id === itemId ? { ...item, ...input } : item) }
      lists.set(listId, next)
      return { item: next.items.find((item) => item.id === itemId), list: next }
    },
  }
  return { api, calls, lists }
}

const names = (calls) => calls.map(([name]) => name)
const item = (name, extra = {}) => ({ name, product: null, ...extra })

test('a new list is created in the preferred currency, then its items are added in order', async () => {
  const { api, calls } = fakeApi()
  const cache = createDataCache()
  const result = await applyProposal({ steps: [{ type: 'create_list', name: 'Weekly', items: [item('Eggs', { product: { id: '10', name: 'Eggs' } }), item('Calamansi')] }] }, { api, cache, preferredCurrency: 'USD' })
  assert.deepEqual(names(calls), ['createList', 'addListItem', 'createCatalogItem', 'addListItem'])
  assert.deepEqual(calls[0][1], { name: 'Weekly', currency: 'USD' })
  assert.equal(calls[1][2], '10')
  assert.deepEqual(result.saved, ['List Weekly', 'Eggs', 'Calamansi'])
  assert.deepEqual(result.failed, [])
  assert.equal(result.listId, '100')
  assert.equal(cache.get('list:100').data.items.length, 2)
})

test('a quantity is applied only to a newly added item', async () => {
  const { api, calls, lists } = fakeApi()
  lists.set('1', detail('1', [{ id: 'old', productId: '10', bought: false }]))
  const steps = [{ type: 'add_items', list: { listId: '1' }, items: [
    item('Eggs', { product: { id: '10', name: 'Eggs' }, quantity: '2.000' }),
    item('Rice', { product: { id: '11', name: 'Rice' }, quantity: '3.000', unitLabel: 'kg' }),
  ] }]
  const result = await applyProposal({ steps }, { api, cache: createDataCache(), preferredCurrency: 'PHP' })
  const updates = calls.filter(([name]) => name === 'updateListItem')
  assert.equal(updates.length, 1)
  assert.deepEqual(updates[0][3], { quantity: '3.000', unitLabel: 'kg' })
  assert.deepEqual(result.skipped, ['Eggs'])
  assert.deepEqual(result.saved, ['Rice'])
})

test('a new item with no amount sends no update', async () => {
  const { api, calls } = fakeApi()
  await applyProposal({ steps: [{ type: 'add_items', list: { listId: '1' }, items: [item('Rice', { product: { id: '11' } })] }] }, { api, cache: createDataCache(), preferredCurrency: 'PHP' })
  assert.ok(!names(calls).includes('updateListItem'))
})

test('a partial failure keeps what saved, reports what failed and never retries', async () => {
  const { api, calls } = fakeApi({ fail: (name, args) => name === 'addListItem' && args[1] === '11' })
  const steps = [{ type: 'add_items', list: { listId: '1' }, items: [
    item('Eggs', { product: { id: '10' } }), item('Rice', { product: { id: '11' } }), item('Bread', { product: { id: '12' } }),
  ] }]
  const result = await applyProposal({ steps }, { api, cache: createDataCache(), preferredCurrency: 'PHP' })
  assert.deepEqual(result.saved, ['Eggs', 'Bread'])
  assert.deepEqual(result.failed, ['Rice'])
  assert.equal(calls.filter(([name, , product]) => name === 'addListItem' && product === '11').length, 1)
})

test('a failed new list reports its items as failed too, and later steps still run', async () => {
  const { api, calls } = fakeApi({ fail: (name) => name === 'createList' })
  const steps = [
    { type: 'create_list', name: 'Party', items: [item('Chips')] },
    { type: 'add_catalog_items', items: [item('Salsa', { category: 'Pantry' })] },
  ]
  const result = await applyProposal({ steps }, { api, cache: createDataCache(), preferredCurrency: 'PHP' })
  assert.deepEqual(result.failed, ['List Party', 'Chips'])
  assert.deepEqual(result.saved, ['Salsa'])
  assert.equal(result.listId, null)
  assert.equal(calls.filter(([name]) => name === 'createList').length, 1)
})

test('a failed quantity keeps the item and names the problem', async () => {
  const { api } = fakeApi({ fail: (name) => name === 'updateListItem' })
  const steps = [{ type: 'add_items', list: { listId: '1' }, items: [item('Rice', { product: { id: '11' }, quantity: '2.000' })] }]
  const result = await applyProposal({ steps }, { api, cache: createDataCache(), preferredCurrency: 'PHP' })
  assert.deepEqual(result.saved, ['Rice'])
  assert.deepEqual(result.failed, ['Amount for Rice'])
})

test('new catalog items invalidate the catalog cache, and existing matches are reused', async () => {
  const { api, calls } = fakeApi()
  const cache = createDataCache()
  cache.set('catalog', { items: [] })
  assert.notEqual(cache.get('catalog').updatedAt, 0)
  const steps = [{ type: 'add_catalog_items', items: [item('Salsa', { category: 'Pantry' }), item('Tofu'), item('Eggs', { product: { id: '10', name: 'Eggs' } })] }]
  const result = await applyProposal({ steps }, { api, cache, preferredCurrency: 'PHP' })
  assert.deepEqual(calls.map(([, input]) => input), [{ name: 'Salsa', category: 'Pantry' }, { name: 'Tofu', category: 'Other' }])
  assert.deepEqual(result.saved, ['Salsa', 'Tofu'])
  assert.deepEqual(result.skipped, ['Eggs'])
  assert.equal(cache.get('catalog').updatedAt, 0)
})

test('a failed catalog create still marks the catalog for reload, because its load was cancelled', async () => {
  const { api } = fakeApi({ fail: (name) => name === 'createCatalogItem' })
  const cache = createDataCache()
  cache.set('catalog', { items: [] })
  const result = await applyProposal({ steps: [{ type: 'add_catalog_items', items: [item('Salsa')] }] }, { api, cache, preferredCurrency: 'PHP' })
  assert.deepEqual(result.failed, ['Salsa'])
  assert.equal(cache.get('catalog').updatedAt, 0)
})

test('an item made in an earlier step is not created twice', async () => {
  const { api, calls } = fakeApi()
  const steps = [
    { type: 'add_catalog_items', items: [item('Chips')] },
    { type: 'add_items', list: { listId: '1' }, items: [item('Chips')] },
  ]
  await applyProposal({ steps }, { api, cache: createDataCache(), preferredCurrency: 'PHP' })
  assert.equal(names(calls).filter((name) => name === 'createCatalogItem').length, 1)
})

test('marking bought updates only the matched items and the list cache', async () => {
  const { api, calls, lists } = fakeApi()
  lists.set('1', detail('1', [{ id: 'a', name: 'Eggs', bought: false }]))
  const cache = createDataCache()
  const steps = [{ type: 'mark_bought', list: { listId: '1' }, itemNames: ['egg', 'x'], match: { found: [{ id: 'a', name: 'Eggs' }], alreadyBought: ['Milk'], missing: ['x'] } }]
  const result = await applyProposal({ steps }, { api, cache, preferredCurrency: 'PHP' })
  assert.deepEqual(calls, [['updateListItem', '1', 'a', { bought: true }]])
  assert.deepEqual(result.saved, ['Eggs'])
  assert.deepEqual(result.skipped, ['Milk'])
  assert.equal(result.listId, '1')
  assert.equal(cache.get('list:1').data.items[0].bought, true)
})

test('list saves update the summaries and release the cache lock on failure', async () => {
  const { api } = fakeApi({ fail: (name) => name === 'addListItem' })
  const cache = createDataCache()
  cache.set('list:1', detail('1'))
  await applyProposal({ steps: [{ type: 'add_items', list: { listId: '1' }, items: [item('Rice', { product: { id: '11' } })] }] }, { api, cache, preferredCurrency: 'PHP' })
  assert.equal(cache.get('list:1').updatedAt, 0)
  await cache.load('list:1', async () => detail('1', [], 2))
  assert.equal(cache.get('list:1').data.revision, 2, 'an unreleased lock would block this load')
})

test('a session change stops the remaining saves', async () => {
  const api = { addListItem: async () => { throw new DOMException('Session identity changed', 'AbortError') } }
  const steps = [{ type: 'add_items', list: { listId: '1' }, items: [item('Rice', { product: { id: '11' } })] }]
  await assert.rejects(applyProposal({ steps }, { api, cache: createDataCache(), preferredCurrency: 'PHP' }), { name: 'AbortError' })
})

const NOW = Date.parse('2026-11-05T10:00:00.000Z')
const format = (date) => date.toISOString()

test('limit errors add the reset time from Retry-After', () => {
  const daily = Object.assign(new Error("You've used today's 5 demo messages."), { code: 'ASSISTANT_DAILY_LIMIT', retryAfter: 3600 })
  assert.equal(assistantErrorText(daily, { now: NOW, formatTime: format }), "You've used today's 5 demo messages. They reset at 2026-11-05T11:00:00.000Z.")
  const app = Object.assign(new Error('The demo is full for today.'), { code: 'ASSISTANT_APP_LIMIT', retryAfter: 60 })
  assert.equal(assistantErrorText(app, { now: NOW, formatTime: format }), 'The demo is full for today. Try again after 2026-11-05T10:01:00.000Z.')
})

test("Google's limit and unavailable errors use the server's text as is", () => {
  const provider = Object.assign(new Error('The demo has hit its limit for now. Try again later.'), { code: 'ASSISTANT_PROVIDER_LIMIT' })
  assert.equal(assistantErrorText(provider), 'The demo has hit its limit for now. Try again later.')
})

test('a limit error without Retry-After still reads properly', () => {
  const daily = Object.assign(new Error('The demo is full for today.'), { code: 'ASSISTANT_APP_LIMIT' })
  assert.equal(assistantErrorText(daily), 'The demo is full for today.')
})

test('an account already at its limit reads the same as being refused', () => {
  const usage = { limit: 5, remaining: 0, resetsAt: '2026-11-05T11:00:00.000Z' }
  assert.equal(usedUpText(usage, { formatTime: format }), "You've used today's 5 demo messages. They reset at 2026-11-05T11:00:00.000Z.")
})

test('amounts read naturally on the card', () => {
  assert.equal(itemLabel({ name: 'Rice', quantity: '2.000', unitLabel: 'kg' }), 'Rice (2 kg)')
  assert.equal(itemLabel({ name: 'Rice', quantity: '1.500' }), 'Rice (1.5)')
  assert.equal(itemLabel({ name: 'Rice', unitLabel: 'lata' }), 'Rice (lata)')
  assert.equal(itemLabel({ name: 'Rice' }), 'Rice')
})

test('canned replies use the fixed copy', () => {
  assert.equal(assistantReply('help'), "I'm CartCheck's AI helper. I can create lists, add items, add to your catalog and check items off. You confirm everything first.")
  assert.equal(assistantReply('off_topic'), 'I can only help with your CartCheck lists and catalog.')
  assert.equal(assistantReply('blocked'), "I can't do that here. You can do it from the normal CartCheck screens.")
  assert.equal(assistantReply('unclear'), "I didn't catch that. Try: Add eggs and rice to Weekly.")
  assert.equal(assistantReply('unusable'), "I didn't catch that, and it didn't use a message. Try: Add eggs and rice to Weekly.")
})
