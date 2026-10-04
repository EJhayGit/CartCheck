import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Node = dom.window.Node
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react')
const React = await import('react')
const { createServer } = await import('vite')
const vite = await createServer({ configFile: 'vite.config.js', server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const { default: ShoppingList } = await vite.ssrLoadModule('/src/ShoppingList.jsx')
const { default: Catalog } = await vite.ssrLoadModule('/src/Catalog.jsx')
const { default: App } = await vite.ssrLoadModule('/src/App.jsx')
const { DataCacheProvider } = await vite.ssrLoadModule('/src/dataCache.jsx')

test.afterEach(() => { cleanup(); globalThis.fetch = undefined })
test.after(async () => { await vite.close(); dom.window.close() })

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const seed = (items) => ({ items, currency: 'PHP', budget: null, tripId: 'trip-1', revision: 1 })
function mockFetch(handler) {
  const calls = []
  globalThis.fetch = async (url, options = {}) => { calls.push({ url: String(url), options }); return handler(String(url), options) }
  return calls
}
const noop = () => {}
const appUser = { id: 'shopper-1', email: 'shopper@example.test', email_verified: true, verification_required: false, preferred_currency: 'PHP' }
const starter = { id: 'product-1', name: 'Milk', category: 'Dairy & eggs', source: 'starter' }
const cartItem = { id: 'cart-1', name: 'Milk', category: 'Dairy', quantity: '1', unitLabel: '', estimatedTotal: null, actualTotal: null, bought: false }
const emptyTrips = { items: [], hasMorePages: false, nextCursor: null }
async function openShoppingApp(calls) {
  render(React.createElement(App))
  await screen.findByRole('heading', { name: 'My Shopping List' })
  await waitFor(() => assert.equal(calls.filter((call) => call.url.endsWith('/api/cart')).length, 1))
}
function appNav(name) { return screen.getByRole('navigation', { name: 'Main navigation' }).querySelector(`button[aria-label="${name}"]`) || [...screen.getByRole('navigation', { name: 'Main navigation' }).querySelectorAll('button')].find((button) => button.textContent.trim() === name) }
function shoppingFixture(items) {
  return render(React.createElement(DataCacheProvider, null,
    React.createElement(ShoppingList, { active: true, onBrowseCatalog: noop, onMutationPending: noop, onReviewChange: noop })))
}

test('ten different purchases render immediately while every PATCH is deferred', async () => {
  const items = Array.from({ length: 10 }, (_, index) => ({ id: `item-${index}`, name: `Item ${index}`, category: 'Pantry', quantity: '1', bought: false }))
  const requests = []
  const calls = mockFetch((url, options) => {
    if (url.endsWith('/api/cart') && !options.method) return json(seed(items))
    if (url.includes('/api/cart/items/')) { const request = deferred(); requests.push({ url, options, request }); return request.promise }
    throw new Error(`Unexpected request: ${url}`)
  })
  shoppingFixture(items)
  await screen.findByRole('heading', { name: 'My Shopping List' })
  for (let index = 0; index < 10; index++) fireEvent.click(screen.getByRole('checkbox', { name: `Mark Item ${index} as purchased` }))
  for (let index = 0; index < 10; index++) assert.equal(screen.getByRole('checkbox', { name: `Mark Item ${index} as unpurchased` }).checked, true)
  assert.equal(requests.length, 10)
  assert.equal(calls.filter((call) => call.options.method === 'PATCH').length, 10)
  assert.equal(screen.getByText('0 remaining / 10 purchased').textContent, '0 remaining / 10 purchased')
})

test('same item clicks coalesce behind one in-flight PATCH and persist the latest state', async () => {
  const item = { id: 'one', name: 'Milk', category: 'Dairy', quantity: '1', bought: false }
  const writes = []
  mockFetch((url, options) => {
    if (url.endsWith('/api/cart') && !options.method) return json(seed([item]))
    if (url.endsWith('/api/cart/items/one')) {
      const request = deferred(); writes.push({ body: JSON.parse(options.body), request }); return request.promise
    }
    throw new Error(`Unexpected request: ${url}`)
  })
  shoppingFixture([item])
  await screen.findByRole('checkbox', { name: 'Mark Milk as purchased' })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Mark Milk as purchased' }))
  assert.equal(screen.getByRole('checkbox', { name: 'Mark Milk as unpurchased' }).checked, true)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Mark Milk as unpurchased' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Mark Milk as purchased' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Mark Milk as unpurchased' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Mark Milk as purchased' }))
  assert.equal(screen.getByRole('checkbox', { name: 'Mark Milk as unpurchased' }).checked, true)
  assert.equal(writes.length, 1)
  writes[0].request.resolve(json({ item: { ...item, bought: true } }))
  await waitFor(() => assert.equal(writes.length, 2))
  assert.deepEqual(writes.map((write) => write.body), [{ bought: true }, { bought: true }])
  writes[1].request.resolve(json({ item: { ...item, bought: true } }))
  await waitFor(() => assert.equal(screen.getByRole('checkbox', { name: 'Mark Milk as unpurchased' }).checked, true))
})

test('purchase failure rolls the checkbox back and announces the error', async () => {
  const pending = deferred()
  const item = { id: 'one', name: 'Milk', category: 'Dairy', quantity: '1', bought: false }
  mockFetch((url, options) => {
    if (url.endsWith('/api/cart') && !options.method) return json(seed([item]))
    if (url.endsWith('/api/cart/items/one')) return pending.promise
    throw new Error(`Unexpected request: ${url}`)
  })
  shoppingFixture([item])
  await screen.findByRole('checkbox', { name: 'Mark Milk as purchased' })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Mark Milk as purchased' }))
  assert.equal(screen.getByRole('checkbox', { name: 'Mark Milk as unpurchased' }).checked, true)
  pending.resolve(json({ error: 'write failed' }, 503))
  await screen.findByRole('alert')
  assert.equal(screen.getByRole('checkbox', { name: 'Mark Milk as purchased' }).checked, false)
})

test('sort and hide controls combine locally without changing cart data', async () => {
  const items = [
    { id: 'z', name: 'Zucchini', category: 'Produce', quantity: '1', bought: false },
    { id: 'a', name: 'Apple', category: 'Produce', quantity: '1', bought: true },
    { id: 'b', name: 'Bread', category: 'Bakery', quantity: '1', bought: false },
  ]
  const calls = mockFetch((url, options) => {
    if (url.endsWith('/api/cart')) return json(seed(items))
    if (url.endsWith('/api/trips')) return json({ items: [], hasMorePages: false, nextCursor: null })
    throw new Error(`Unexpected request: ${url} ${options.method}`)
  })
  shoppingFixture(items)
  await screen.findByRole('heading', { name: 'My Shopping List' })
  const select = screen.getByLabelText('Sort')
  const names = () => [...screen.getByRole('list', { name: 'Sorted shopping items' }).querySelectorAll('.shopping-item-info strong')].map((node) => node.textContent)
  fireEvent.change(select, { target: { value: 'az' } }); assert.deepEqual(names(), ['Apple', 'Bread', 'Zucchini'])
  fireEvent.change(select, { target: { value: 'category' } }); assert.deepEqual(names(), ['Bread', 'Apple', 'Zucchini'])
  fireEvent.change(select, { target: { value: 'purchased' } }); assert.deepEqual(names(), ['Apple', 'Zucchini', 'Bread'])
  fireEvent.click(screen.getByRole('button', { name: 'Hide purchased' })); assert.deepEqual(names(), ['Zucchini', 'Bread'])
  fireEvent.change(select, { target: { value: 'unpurchased' } }); assert.deepEqual(names(), ['Zucchini', 'Bread'])
  assert.equal(calls.filter((call) => call.options.method).length, 0)
})

test('customizing a starter updates its catalog identity once and keeps trip items separate', async () => {
  const starter = { id: 'starter-1', name: 'Rolled oats', category: 'Pantry', source: 'starter' }
  const tripItem = { id: 'cart-1', name: 'Rolled oats', category: 'Pantry', quantity: '1', bought: false }
  const calls = mockFetch((url, options) => {
    if (url.endsWith('/api/cart') && !options.method) return json(seed([tripItem]))
    if (url.endsWith('/api/catalog') && !options.method) return json({ items: [starter] })
    if (url.endsWith('/api/trips')) return json({ items: [], hasMorePages: false, nextCursor: null })
    if (url.endsWith('/api/catalog/starter-1') && options.method === 'PATCH') return json({ item: { ...starter, name: 'Quick oats', source: 'custom' } })
    throw new Error(`Unexpected request: ${url} ${options.method}`)
  })
  function Shell() {
    const [catalog, setCatalog] = React.useState(false)
    return React.createElement(React.Fragment, null,
      React.createElement('button', { type: 'button', onClick: () => setCatalog((value) => !value) }, catalog ? 'List' : 'Catalog'),
      catalog
        ? React.createElement(Catalog, { active: true, onAdd: async () => ({}), onAddPending: noop })
        : React.createElement(ShoppingList, { active: true, onBrowseCatalog: () => setCatalog(true), onMutationPending: noop, onReviewChange: noop }))
  }
  render(React.createElement(DataCacheProvider, null, React.createElement(Shell)))
  await screen.findByRole('heading', { name: 'My Shopping List' })
  fireEvent.click(screen.getByRole('button', { name: 'Catalog' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Customize' }))
  fireEvent.change(screen.getByLabelText('Grocery name'), { target: { value: 'Quick oats' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Save my customization' }).closest('form'))
  await screen.findByRole('button', { name: 'Edit' })
  assert.equal(screen.getByText('Quick oats').textContent, 'Quick oats')
  assert.equal(calls.filter((call) => call.url.endsWith('/api/catalog/starter-1')).length, 1)
  fireEvent.click(screen.getByRole('button', { name: 'List' }))
  assert.equal((await screen.findByText('Rolled oats')).textContent, 'Rolled oats')
  assert.equal(screen.queryByText('Quick oats'), null)
})

test('adding an existing item honors the server bought state when no local purchase intent exists', async () => {
  const calls = mockFetch((url, options) => {
    if (url.endsWith('/api/auth/me')) return json({ user: appUser })
    if (url.endsWith('/api/cart') && !options.method) return json(seed([cartItem]))
    if (url.endsWith('/api/catalog')) return json({ items: [starter] })
    if (url.endsWith('/api/trips')) return json(emptyTrips)
    if (url.endsWith('/api/cart/items') && options.method === 'POST') return json({ item: { ...cartItem, bought: true } })
    throw new Error(`Unexpected request: ${url} ${options.method}`)
  })
  await openShoppingApp(calls)
  fireEvent.click(appNav('Catalog'))
  fireEvent.click(await screen.findByRole('button', { name: 'Add to list' }))
  await screen.findByRole('heading', { name: 'My Shopping List' })
  assert.equal(screen.getByRole('checkbox', { name: 'Mark Milk as unpurchased' }).checked, true)
  assert.equal(calls.filter((call) => call.url.endsWith('/api/cart/items') && call.options.method === 'POST').length, 1)
})

test('adding an existing item preserves a purchase change while its PATCH is pending', async () => {
  const patch = deferred()
  const add = deferred()
  const calls = mockFetch((url, options) => {
    if (url.endsWith('/api/auth/me')) return json({ user: appUser })
    if (url.endsWith('/api/cart') && !options.method) return json(seed([cartItem]))
    if (url.endsWith('/api/catalog')) return json({ items: [starter] })
    if (url.endsWith('/api/trips')) return json(emptyTrips)
    if (url.endsWith('/api/cart/items/cart-1') && options.method === 'PATCH') return patch.promise
    if (url.endsWith('/api/cart/items') && options.method === 'POST') return add.promise
    throw new Error(`Unexpected request: ${url} ${options.method}`)
  })
  await openShoppingApp(calls)
  fireEvent.click(appNav('Catalog'))
  fireEvent.click(await screen.findByRole('button', { name: 'Add to list' }))
  await waitFor(() => assert.equal(calls.some((call) => call.url.endsWith('/api/cart/items') && call.options.method === 'POST'), true))
  const checkbox = screen.getByRole('checkbox', { name: 'Mark Milk as purchased', hidden: true })
  fireEvent.click(checkbox)
  assert.equal(screen.getByRole('checkbox', { name: 'Mark Milk as unpurchased', hidden: true }).checked, true)
  add.resolve(json({ item: { ...cartItem, bought: false } }))
  await waitFor(() => assert.equal(screen.getByRole('checkbox', { name: 'Mark Milk as unpurchased', hidden: true }).checked, true))
  patch.resolve(json({ item: { ...cartItem, bought: true } }))
  await waitFor(() => assert.equal(calls.filter((call) => call.url.endsWith('/api/cart/items/cart-1') && call.options.method === 'PATCH').length, 1))
  assert.equal(screen.getByRole('checkbox', { name: 'Mark Milk as unpurchased', hidden: true }).checked, true)
})

test('adding an existing item preserves a purchase intent completed while POST is in flight', async () => {
  const patch = deferred()
  const add = deferred()
  const calls = mockFetch((url, options) => {
    if (url.endsWith('/api/auth/me')) return json({ user: appUser })
    if (url.endsWith('/api/cart') && !options.method) return json(seed([cartItem]))
    if (url.endsWith('/api/catalog')) return json({ items: [starter] })
    if (url.endsWith('/api/trips')) return json(emptyTrips)
    if (url.endsWith('/api/cart/items/cart-1') && options.method === 'PATCH') return patch.promise
    if (url.endsWith('/api/cart/items') && options.method === 'POST') return add.promise
    throw new Error(`Unexpected request: ${url} ${options.method}`)
  })
  await openShoppingApp(calls)
  fireEvent.click(appNav('Catalog'))
  fireEvent.click(await screen.findByRole('button', { name: 'Add to list' }))
  await waitFor(() => assert.equal(calls.some((call) => call.url.endsWith('/api/cart/items') && call.options.method === 'POST'), true))
  const checkbox = screen.getByRole('checkbox', { name: 'Mark Milk as purchased', hidden: true })
  fireEvent.click(checkbox)
  patch.resolve(json({ item: { ...cartItem, bought: true } }))
  await waitFor(() => assert.equal(screen.getByRole('checkbox', { name: 'Mark Milk as unpurchased', hidden: true }).checked, true))
  add.resolve(json({ item: { ...cartItem, bought: false } }))
  await waitFor(() => assert.equal(screen.getByRole('checkbox', { name: 'Mark Milk as unpurchased' }).checked, true))
})
