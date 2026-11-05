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

test.afterEach(() => { cleanup(); globalThis.fetch = undefined; window.history.replaceState(null, '', '/') })
test.after(async () => { await vite.close(); dom.window.close() })

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const seed = (items) => ({ name: 'Weekly Groceries', status: 'active', items, currency: 'PHP', budget: null, tripId: 'trip-1', revision: 1 })
function mockFetch(handler) {
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options })
    if (url === '/api/lists') return json({ items: [{ tripId: 'trip-1', name: 'Weekly Groceries', currency: 'PHP', budget: null, summary: {} }], nextCursor: null })
    if ((url === '/api/catalog' || url === '/api/trips') && !options.method) {
      try { return await handler(String(url), options) } catch { return json({ items: [], nextCursor: null }) }
    }
    const response = await handler(String(url), options)
    if (url.startsWith('/api/lists/trip-1/items') && response.ok) {
      const body = await response.json()
      if (body.item && !body.list) return json({ ...body, list: { ...seed([body.item]), revision: 2 } })
      return json(body)
    }
    return response
  }
  return calls
}
const noop = () => {}
// Inside waitFor, assert.ok rather than assert.equal on a DOM element: a retried failure formats the whole jsdom tree (46s, 21GB), which got CI cancelled.
const appUser = { id: 'shopper-1', email: 'shopper@example.test', email_verified: true, verification_required: false, preferred_currency: 'PHP' }
const starter = { id: 'product-1', name: 'Milk', category: 'Dairy & eggs', source: 'starter' }
const cartItem = { id: 'cart-1', name: 'Milk', category: 'Dairy', quantity: '1', unitLabel: '', estimatedTotal: null, actualTotal: null, bought: false }
const emptyTrips = { items: [], hasMorePages: false, nextCursor: null }
async function openShoppingApp(calls) {
  window.history.replaceState(null, '', '/lists/trip-1')
  render(React.createElement(App))
  await screen.findByRole('heading', { name: 'Weekly Groceries' })
  await waitFor(() => assert.equal(calls.filter((call) => call.url.endsWith('/api/lists/trip-1')).length, 1))
}
function appNav(name) { return screen.getByRole('navigation', { name: 'Main navigation' }).querySelector(`button[aria-label="${name}"]`) || [...screen.getByRole('navigation', { name: 'Main navigation' }).querySelectorAll('button')].find((button) => button.textContent.trim() === name) }
function shoppingFixture(items) {
  return render(React.createElement(DataCacheProvider, null,
    React.createElement(ShoppingList, { listId: 'trip-1', active: true, onBrowseCatalog: noop, onMutationPending: noop, onReviewChange: noop })))
}

test('ten different purchases render immediately while every PATCH is deferred', async () => {
  const items = Array.from({ length: 10 }, (_, index) => ({ id: `item-${index}`, name: `Item ${index}`, category: 'Pantry', quantity: '1', bought: false }))
  const requests = []
  const calls = mockFetch((url, options) => {
    if (url.endsWith('/api/lists/trip-1') && !options.method) return json(seed(items))
    if (url.includes('/api/lists/trip-1/items/')) { const request = deferred(); requests.push({ url, options, request }); return request.promise }
    throw new Error(`Unexpected request: ${url}`)
  })
  shoppingFixture(items)
  await screen.findByRole('heading', { name: 'Weekly Groceries' })
  for (let index = 0; index < 10; index++) fireEvent.click(screen.getByRole('checkbox', { name: `Item ${index}` }))
  for (let index = 0; index < 10; index++) assert.equal(screen.getByRole('checkbox', { name: `Item ${index}` }).checked, true)
  assert.equal(requests.length, 10)
  assert.equal(calls.filter((call) => call.options.method === 'PATCH').length, 10)
  assert.match(document.querySelector('.list-progress-line').textContent, /^10 of 10 bought/)
})

test('same item clicks coalesce behind one in-flight PATCH and persist the latest state', async () => {
  const item = { id: 'one', name: 'Milk', category: 'Dairy', quantity: '1', bought: false }
  const writes = []
  mockFetch((url, options) => {
    if (url.endsWith('/api/lists/trip-1') && !options.method) return json(seed([item]))
    if (url.endsWith('/api/lists/trip-1/items/one')) {
      const request = deferred(); writes.push({ body: JSON.parse(options.body), request }); return request.promise
    }
    throw new Error(`Unexpected request: ${url}`)
  })
  shoppingFixture([item])
  await screen.findByRole('checkbox', { name: 'Milk' })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Milk' }))
  assert.equal(screen.getByRole('checkbox', { name: 'Milk' }).checked, true)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Milk' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Milk' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Milk' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Milk' }))
  assert.equal(screen.getByRole('checkbox', { name: 'Milk' }).checked, true)
  assert.equal(writes.length, 1)
  writes[0].request.resolve(json({ item: { ...item, bought: true } }))
  await waitFor(() => assert.equal(writes.length, 2))
  assert.deepEqual(writes.map((write) => write.body), [{ bought: true }, { bought: true }])
  writes[1].request.resolve(json({ item: { ...item, bought: true } }))
  await waitFor(() => assert.equal(screen.getByRole('checkbox', { name: 'Milk' }).checked, true))
})

test('purchase failure rolls the checkbox back and announces the error', async () => {
  const pending = deferred()
  const item = { id: 'one', name: 'Milk', category: 'Dairy', quantity: '1', bought: false }
  mockFetch((url, options) => {
    if (url.endsWith('/api/lists/trip-1') && !options.method) return json(seed([item]))
    if (url.endsWith('/api/lists/trip-1/items/one')) return pending.promise
    throw new Error(`Unexpected request: ${url}`)
  })
  shoppingFixture([item])
  await screen.findByRole('checkbox', { name: 'Milk' })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Milk' }))
  assert.equal(screen.getByRole('checkbox', { name: 'Milk' }).checked, true)
  pending.resolve(json({ error: 'write failed' }, 503))
  await screen.findByRole('alert')
  assert.equal(screen.getByRole('checkbox', { name: 'Milk' }).checked, false)
})

test('sort and hide controls combine locally without changing cart data', async () => {
  const items = [
    { id: 'z', name: 'Zucchini', category: 'Produce', quantity: '1', bought: false },
    { id: 'a', name: 'Apple', category: 'Produce', quantity: '1', bought: true },
    { id: 'b', name: 'Bread', category: 'Bakery', quantity: '1', bought: false },
  ]
  const calls = mockFetch((url, options) => {
    if (url.endsWith('/api/lists/trip-1')) return json(seed(items))
    if (url.endsWith('/api/trips')) return json({ items: [], hasMorePages: false, nextCursor: null })
    throw new Error(`Unexpected request: ${url} ${options.method}`)
  })
  shoppingFixture(items)
  await screen.findByRole('heading', { name: 'Weekly Groceries' })
  const select = screen.getByLabelText('Sort')
  const names = () => [...screen.getByRole('region', { name: 'Grocery items' }).querySelectorAll('.shopping-item-info strong')].map((node) => node.textContent)
  assert.deepEqual(names(), ['Zucchini', 'Bread', 'Apple'])
  fireEvent.change(select, { target: { value: 'az' } }); assert.deepEqual(names(), ['Apple', 'Bread', 'Zucchini'])
  fireEvent.change(select, { target: { value: 'category' } }); assert.deepEqual(names(), ['Bread', 'Apple', 'Zucchini'])
  assert.deepEqual(screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent), ['Bakery', 'Produce'])
  fireEvent.click(screen.getByRole('button', { name: 'Hide bought' })); assert.deepEqual(names(), ['Bread', 'Zucchini'])
  fireEvent.change(select, { target: { value: 'default' } }); assert.deepEqual(names(), ['Zucchini', 'Bread'])
  assert.equal(calls.filter((call) => call.options.method).length, 0)
})

test('customizing a starter updates its catalog identity once and keeps trip items separate', async () => {
  const starter = { id: 'starter-1', name: 'Rolled oats', category: 'Pantry', source: 'starter' }
  const tripItem = { id: 'cart-1', name: 'Rolled oats', category: 'Pantry', quantity: '1', bought: false }
  const calls = mockFetch((url, options) => {
    if (url.endsWith('/api/lists/trip-1') && !options.method) return json(seed([tripItem]))
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
        : React.createElement(ShoppingList, { listId: 'trip-1', active: true, onBrowseCatalog: () => setCatalog(true), onMutationPending: noop, onReviewChange: noop }))
  }
  render(React.createElement(DataCacheProvider, null, React.createElement(Shell)))
  await screen.findByRole('heading', { name: 'Weekly Groceries' })
  fireEvent.click(screen.getByRole('button', { name: 'Catalog' }))
  fireEvent.click(await screen.findByRole('button', { name: /^Customize / }))
  fireEvent.change(screen.getByLabelText('Grocery name'), { target: { value: 'Quick oats' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Save my customization' }).closest('form'))
  await screen.findByRole('button', { name: /^Edit / })
  assert.equal(screen.getByText('Quick oats').textContent, 'Quick oats')
  assert.equal(calls.filter((call) => call.url.endsWith('/api/catalog/starter-1')).length, 1)
  fireEvent.click(screen.getByRole('button', { name: 'List' }))
  assert.equal((await screen.findByText('Rolled oats')).textContent, 'Rolled oats')
  assert.equal(screen.queryByText('Quick oats'), null)
})

test('adding an existing item honors the server bought state when no local purchase intent exists', async () => {
  const calls = mockFetch((url, options) => {
    if (url.endsWith('/api/auth/me')) return json({ user: appUser })
    if (url.endsWith('/api/lists/trip-1') && !options.method) return json(seed([cartItem]))
    if (url.endsWith('/api/catalog')) return json({ items: [starter] })
    if (url.endsWith('/api/trips')) return json(emptyTrips)
    if (url.endsWith('/api/lists/trip-1/items') && options.method === 'POST') return json({ item: { ...cartItem, bought: true } })
    throw new Error(`Unexpected request: ${url} ${options.method}`)
  })
  await openShoppingApp(calls)
  fireEvent.click(screen.getByRole('button', { name: 'Browse catalog' }))
  fireEvent.click(await screen.findByRole('button', { name: /^Add / }))
  await screen.findByRole('heading', { name: 'Weekly Groceries' })
  assert.equal(screen.getByRole('checkbox', { name: 'Milk' }).checked, true)
  assert.equal(calls.filter((call) => call.url.endsWith('/api/lists/trip-1/items') && call.options.method === 'POST').length, 1)
})

test('catalog add preserves an in-flight purchase across selected-list unmount and remount', async () => {
  const patch = deferred()
  const add = deferred()
  const calls = mockFetch((url, options) => {
    if (url.endsWith('/api/auth/me')) return json({ user: appUser })
    if (url.endsWith('/api/lists/trip-1') && !options.method) return json(seed([cartItem]))
    if (url.endsWith('/api/catalog')) return json({ items: [starter] })
    if (url.endsWith('/api/trips')) return json(emptyTrips)
    if (url.endsWith('/api/lists/trip-1/items/cart-1') && options.method === 'PATCH') return patch.promise
    if (url.endsWith('/api/lists/trip-1/items') && options.method === 'POST') return add.promise
    throw new Error('Unexpected request: ' + url)
  })
  await openShoppingApp(calls)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Milk' }))
  assert.equal(screen.getByRole('checkbox', { name: 'Milk' }).checked, true)
  // Browser navigation is possible while the captured list's request is pending.
  window.history.pushState(null, '', '/catalog')
  fireEvent(window, new window.PopStateEvent('popstate'))
  fireEvent.change(await screen.findByLabelText('Add items to'), { target: { value: 'trip-1' } })
  fireEvent.click(screen.getByRole('button', { name: /^Add / }))
  await waitFor(() => assert.equal(calls.some((call) => call.url.endsWith('/api/lists/trip-1/items') && call.options.method === 'POST'), true))
  add.resolve(json({ item: { ...cartItem, bought: false } }))
  await screen.findByRole('heading', { name: 'Weekly Groceries' })
  assert.equal(screen.getByRole('checkbox', { name: 'Milk' }).checked, true)
  patch.resolve(json({ item: { ...cartItem, bought: true } }))
  await waitFor(() => assert.equal(screen.getByRole('checkbox', { name: 'Milk' }).checked, true))
})

test('catalog add preserves a purchase intent confirmed while its POST response is delayed', async () => {
  const patch = deferred()
  const add = deferred()
  const calls = mockFetch((url, options) => {
    if (url.endsWith('/api/auth/me')) return json({ user: appUser })
    if (url.endsWith('/api/lists/trip-1') && !options.method) return json(seed([cartItem]))
    if (url.endsWith('/api/catalog')) return json({ items: [starter] })
    if (url.endsWith('/api/trips')) return json(emptyTrips)
    if (url.endsWith('/api/lists/trip-1/items/cart-1') && options.method === 'PATCH') return patch.promise
    if (url.endsWith('/api/lists/trip-1/items') && options.method === 'POST') return add.promise
    throw new Error('Unexpected request: ' + url)
  })
  await openShoppingApp(calls)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Milk' }))
  window.history.pushState(null, '', '/catalog')
  fireEvent(window, new window.PopStateEvent('popstate'))
  fireEvent.change(await screen.findByLabelText('Add items to'), { target: { value: 'trip-1' } })
  fireEvent.click(screen.getByRole('button', { name: /^Add / }))
  await waitFor(() => assert.equal(calls.some((call) => call.url.endsWith('/api/lists/trip-1/items') && call.options.method === 'POST'), true))
  patch.resolve(json({ item: { ...cartItem, bought: true } }))
  // Wait until the writer is released before delivering an older add snapshot.
  await waitFor(() => assert.equal(calls.filter((call) => call.options.method === 'PATCH').length, 1))
  await new Promise((resolve) => setTimeout(resolve, 0))
  add.resolve(json({ item: { ...cartItem, bought: false } }))
  await screen.findByRole('heading', { name: 'Weekly Groceries' })
  assert.equal(screen.getByRole('checkbox', { name: 'Milk' }).checked, true)
})

test('checking an item moves keyboard focus to the next item still to buy', async () => {
  const items = [{ id: 'a', name: 'Apples', category: 'Produce', quantity: '1', bought: false }, { id: 'b', name: 'Bread', category: 'Bakery', quantity: '1', bought: false }]
  mockFetch((url, options) => {
    if (url.endsWith('/api/lists/trip-1') && !options.method) return json(seed(items))
    if (url.endsWith('/api/lists/trip-1/items/a')) return deferred().promise
    throw new Error(`Unexpected request: ${url}`)
  })
  shoppingFixture(items)
  const apples = await screen.findByRole('checkbox', { name: 'Apples' })
  apples.focus()
  fireEvent.click(apples)
  // The ticked row stays in place briefly, then settles into Bought and focus moves on.
  assert.equal(document.activeElement, screen.getByRole('checkbox', { name: 'Apples' }))
  assert.equal(screen.getByRole('list', { name: 'To buy' }).contains(apples), true)
  assert.match(screen.getByText(/Apples bought/).textContent, /1 left/)
  await new Promise((resolve) => setTimeout(resolve, 1700))
  assert.equal(document.activeElement, screen.getByRole('checkbox', { name: 'Bread' }))
  assert.equal(screen.getByRole('list', { name: 'Bought' }).contains(screen.getByRole('checkbox', { name: 'Apples' })), true)
})

test('adding a new catalog item keeps the shopper in the catalog and counts the add', async () => {
  const calls = mockFetch((url, options) => {
    if (url.endsWith('/api/auth/me')) return json({ user: appUser })
    if (url.endsWith('/api/lists/trip-1') && !options.method) return json(seed([]))
    if (url.endsWith('/api/catalog')) return json({ items: [starter] })
    if (url.endsWith('/api/trips')) return json(emptyTrips)
    if (url.endsWith('/api/lists/trip-1/items') && options.method === 'POST') return json({ item: cartItem, created: true })
    throw new Error(`Unexpected request: ${url} ${options.method}`)
  })
  window.history.replaceState(null, '', '/lists/trip-1')
  render(React.createElement(App))
  fireEvent.click(await screen.findByRole('button', { name: 'Browse catalog' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Add Milk' }))
  await screen.findByText('1 added')
  assert.ok(screen.getByRole('heading', { name: 'Catalog' }))
  assert.equal(window.location.pathname, '/catalog')
  assert.equal(calls.filter((call) => call.options.method === 'POST').length, 1)
  fireEvent.click(screen.getByRole('button', { name: 'Back to list' }))
  assert.equal(await screen.findByRole('checkbox', { name: 'Milk' }).then((box) => box.checked), false)
})

test('undo reverses the last check from the status bar', async () => {
  const items = [{ id: 'a', name: 'Apples', category: 'Produce', quantity: '1', bought: false }]
  const writes = []
  mockFetch((url, options) => {
    if (url.endsWith('/api/lists/trip-1') && !options.method) return json(seed(items))
    if (url.endsWith('/api/lists/trip-1/items/a')) { writes.push(JSON.parse(options.body).bought); return json({ item: { ...items[0], bought: JSON.parse(options.body).bought } }) }
    throw new Error()
  })
  shoppingFixture(items)
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Apples' }))
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  await waitFor(() => assert.equal(screen.getByRole('checkbox', { name: 'Apples' }).checked, false))
  assert.match(screen.getByText(/moved back to To buy/).textContent, /Apples/)
  assert.equal(screen.queryByRole('button', { name: 'Undo' }), null)
  await waitFor(() => assert.equal(writes.at(-1), false))
})

test('find-or-add suggests items from the last trip first', async () => {
  const catalog = [{ id: 'p-1', name: 'Almond milk', category: 'Dairy & eggs', source: 'starter' }, { id: 'p-2', name: 'Fresh milk', category: 'Dairy & eggs', source: 'starter' }]
  mockFetch((url, options) => {
    if (url.endsWith('/api/lists/trip-1') && !options.method) return json(seed([]))
    if (url.endsWith('/api/catalog')) return json({ items: catalog })
    if (url.endsWith('/api/trips')) return json({ items: [{ id: 'old', name: 'Saturday', itemCount: 1, boughtCount: 1, notBoughtCount: 0, summary: {} }], nextCursor: null })
    if (url.endsWith('/api/trips/old')) return json({ trip: { id: 'old', items: [{ id: 'x', productId: 'p-2', name: 'Fresh milk', bought: true }] } })
    throw new Error(`Unexpected request: ${url}`)
  })
  shoppingFixture([])
  fireEvent.change(await screen.findByLabelText('Find or add an item'), { target: { value: 'milk' } })
  await waitFor(() => assert.match(screen.getByRole('list', { name: 'Add from your catalog' }).textContent, /^Fresh milk.*on your last trip.*Almond milk/))
})

test('Enter in the find field adds the top suggestion', async () => {
  const catalog = [{ id: 'p-1', name: 'Dinorado rice', category: 'Pantry', source: 'starter' }, { id: 'p-2', name: 'Rice', category: 'Pantry', source: 'starter' }]
  mockFetch((url, options) => {
    if (url.endsWith('/api/lists/trip-1') && !options.method) return json(seed([]))
    if (url.endsWith('/api/catalog')) return json({ items: catalog })
    if (url.endsWith('/api/trips')) return json(emptyTrips)
    throw new Error(`Unexpected request: ${url}`)
  })
  const added = []
  render(React.createElement(DataCacheProvider, null,
    React.createElement(ShoppingList, { listId: 'trip-1', active: true, onBrowseCatalog: noop, onQuickAdd: async (id) => { added.push(id) }, onMutationPending: noop, onReviewChange: noop })))
  const field = await screen.findByLabelText('Find or add an item')
  fireEvent.change(field, { target: { value: 'rice' } })
  await screen.findByRole('button', { name: 'Add Rice' })
  fireEvent.keyDown(field, { key: 'Enter' })
  await waitFor(() => assert.deepEqual(added, ['p-2']))
  await waitFor(() => assert.equal(field.value, ''))
})

function typedItemFixture({ catalog = [], items = [], catalogResponse, createResponse, onQuickAdd }) {
  const calls = mockFetch((url, options) => {
    if (url.endsWith('/api/lists/trip-1') && !options.method) return json(seed(items))
    if (url.endsWith('/api/catalog') && options.method === 'POST') return createResponse ? createResponse(JSON.parse(options.body)) : json({ item: { id: 'new-1', ...JSON.parse(options.body), source: 'custom' } }, 201)
    if (url.endsWith('/api/catalog')) return catalogResponse ? catalogResponse() : json({ items: catalog })
    if (url.endsWith('/api/trips')) return json(emptyTrips)
    throw new Error(`Unexpected request: ${url}`)
  })
  render(React.createElement(DataCacheProvider, null,
    React.createElement(ShoppingList, { listId: 'trip-1', active: true, onBrowseCatalog: noop, onQuickAdd, onMutationPending: noop, onReviewChange: noop })))
  return () => calls.filter((call) => call.options.method === 'POST')
}
async function typeInFind(value) {
  const field = await screen.findByLabelText('Find or add an item')
  fireEvent.change(field, { target: { value } })
  return field
}

test('tapping the Add row creates a private Other item and adds it to this list', async () => {
  const added = []
  const posts = []
  typedItemFixture({ onQuickAdd: async (id) => { added.push(id) }, createResponse: (body) => { posts.push(body); return json({ item: { id: 'new-1', ...body, source: 'custom' } }, 201) } })
  const field = await typeInFind('  Ube jam ')
  fireEvent.click(await screen.findByRole('button', { name: /^Add “Ube jam”/ }))
  await waitFor(() => assert.deepEqual(added, ['new-1']))
  assert.deepEqual(posts, [{ name: 'Ube jam', category: 'Other' }])
  await waitFor(() => assert.equal(field.value, ''))
  assert.ok(screen.getByText('Ube jam added.'))
  await waitFor(() => assert.ok(document.activeElement === field))
})

test('Enter with no catalog match creates the item once and adds it', async () => {
  const added = []
  const posts = []
  typedItemFixture({ onQuickAdd: async (id) => { added.push(id) }, createResponse: (body) => { posts.push(body); return json({ item: { id: 'new-1', ...body } }, 201) } })
  const field = await typeInFind('Ube jam')
  await screen.findByRole('button', { name: /^Add “Ube jam”/ })
  fireEvent.keyDown(field, { key: 'Enter' })
  fireEvent.keyDown(field, { key: 'Enter' })
  await waitFor(() => assert.deepEqual(added, ['new-1']))
  assert.equal(posts.length, 1)
})

test('the catalog link stays available beside the Add row and keeps the term', async () => {
  const browsed = []
  mockFetch((url, options) => {
    if (url.endsWith('/api/lists/trip-1') && !options.method) return json(seed([]))
    if (url.endsWith('/api/catalog')) return json({ items: [] })
    if (url.endsWith('/api/trips')) return json(emptyTrips)
    throw new Error(`Unexpected request: ${url}`)
  })
  render(React.createElement(DataCacheProvider, null,
    React.createElement(ShoppingList, { listId: 'trip-1', active: true, onBrowseCatalog: (term) => browsed.push(term), onQuickAdd: noop, onMutationPending: noop, onReviewChange: noop })))
  await typeInFind('Ube jam')
  fireEvent.click(await screen.findByRole('button', { name: 'Find or create it in the catalog' }))
  assert.deepEqual(browsed, ['Ube jam'])
})

test('no Add row when the only match is already on this list', async () => {
  const product = { id: 'p-1', name: 'Milk', category: 'Dairy & eggs' }
  const added = []
  const calls = typedItemFixture({ catalog: [product], items: [{ ...cartItem, productId: 'p-1' }], onQuickAdd: async (id) => { added.push(id) } })
  const field = await typeInFind('milk')
  await screen.findByText('Already on this list.')
  assert.equal(screen.queryByRole('button', { name: /^Add “/ }), null)
  fireEvent.keyDown(field, { key: 'Enter' })
  assert.deepEqual(added, [])
  assert.equal(calls().length, 0)
})

test('the Add row shows beside suggestions that are not exact, and Enter still takes a word-start match', async () => {
  const added = []
  const calls = typedItemFixture({ catalog: [{ id: 'p-1', name: 'Dinorado rice', category: 'Pantry' }], onQuickAdd: async (id) => { added.push(id) } })
  const field = await typeInFind('rice')
  await screen.findByRole('button', { name: 'Add Dinorado rice' })
  assert.ok(screen.getByRole('button', { name: /^Add “rice”/ }))
  fireEvent.keyDown(field, { key: 'Enter' })
  await waitFor(() => assert.deepEqual(added, ['p-1']))
  assert.equal(calls().length, 0)
})

test('an exact or plural catalog match hides the Add row', async () => {
  const added = []
  typedItemFixture({ catalog: [{ id: 'p-1', name: 'Bananas', category: 'Produce' }], onQuickAdd: async (id) => { added.push(id) } })
  const field = await typeInFind('banana')
  await screen.findByRole('button', { name: 'Add Bananas' })
  assert.equal(screen.queryByRole('button', { name: /^Add “/ }), null)
  fireEvent.keyDown(field, { key: 'Enter' })
  await waitFor(() => assert.deepEqual(added, ['p-1']))
})

for (const [term, name] of [['ham', 'Shampoo'], ['ice', 'Orange juice']]) {
  test(`Enter never adds a mid-word match: "${term}" lists ${name} but creates "${term}"`, async () => {
    const added = []
    const posts = []
    typedItemFixture({
      catalog: [{ id: 'p-1', name, category: 'Household' }],
      onQuickAdd: async (id) => { added.push(id) },
      createResponse: (body) => { posts.push(body); return json({ item: { id: 'new-1', ...body } }, 201) },
    })
    const field = await typeInFind(term)
    assert.ok(await screen.findByRole('button', { name: `Add ${name}` }))
    assert.ok(screen.getByRole('button', { name: new RegExp(`^Add “${term}”`) }))
    fireEvent.keyDown(field, { key: 'Enter' })
    await waitFor(() => assert.deepEqual(added, ['new-1']))
    assert.deepEqual(posts, [{ name: term, category: 'Other' }])
  })
}

test('Enter does nothing when the exact match is on the list and only a mid-word match is left', async () => {
  const added = []
  const calls = typedItemFixture({
    catalog: [{ id: 'p-1', name: 'Milk', category: 'Dairy & eggs' }, { id: 'p-2', name: 'Buttermilk', category: 'Dairy & eggs' }],
    items: [{ ...cartItem, productId: 'p-1' }],
    onQuickAdd: async (id) => { added.push(id) },
  })
  const field = await typeInFind('milk')
  await screen.findByRole('button', { name: 'Add Buttermilk' })
  assert.equal(screen.queryByRole('button', { name: /^Add “/ }), null)
  fireEvent.keyDown(field, { key: 'Enter' })
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(added, [])
  assert.equal(calls().length, 0)
})

test('a failed catalog load offers no Add row and Enter creates nothing', async () => {
  const calls = typedItemFixture({ catalogResponse: () => json({ error: 'nope' }, 500), onQuickAdd: noop })
  const field = await typeInFind('Ube jam')
  await screen.findByText('We could not load your catalog.')
  assert.equal(screen.queryByRole('button', { name: /^Add “/ }), null)
  fireEvent.keyDown(field, { key: 'Enter' })
  assert.equal(calls().length, 0)
})

test('a failed create keeps the term and shows an error without adding', async () => {
  const added = []
  typedItemFixture({ onQuickAdd: async (id) => { added.push(id) }, createResponse: () => json({ error: 'Name must be 1 to 120 characters' }, 400) })
  const field = await typeInFind('Ube jam')
  fireEvent.click(await screen.findByRole('button', { name: /^Add “Ube jam”/ }))
  assert.match((await screen.findByRole('alert')).textContent, /We could not create Ube jam/)
  await waitFor(() => assert.ok(document.activeElement === field))
  assert.equal(field.value, 'Ube jam')
  assert.deepEqual(added, [])
  assert.ok(screen.getByRole('button', { name: /^Add “Ube jam”/ }))
})

test('a failed add after create retries the same catalog item instead of a duplicate', async () => {
  const attempts = []
  const posts = []
  typedItemFixture({
    onQuickAdd: async (id) => { attempts.push(id); if (attempts.length === 1) throw new Error('Offline') },
    createResponse: (body) => { posts.push(body); return json({ item: { id: 'new-1', ...body } }, 201) },
  })
  const field = await typeInFind('Ube jam')
  fireEvent.click(await screen.findByRole('button', { name: /^Add “Ube jam”/ }))
  assert.match((await screen.findByRole('alert')).textContent, /We could not add Ube jam/)
  assert.equal(field.value, 'Ube jam')
  assert.equal(screen.queryByRole('button', { name: /^Add “/ }), null)
  fireEvent.keyDown(field, { key: 'Enter' })
  await waitFor(() => assert.deepEqual(attempts, ['new-1', 'new-1']))
  assert.equal(posts.length, 1)
})

const stepperItems = [
  { id: 'one', name: 'Milk', category: 'Dairy', quantity: '1.000', unitLabel: null, estimatedTotal: null, actualTotal: null, bought: false },
  { id: 'three', name: 'Apples', category: 'Produce', quantity: '3.000', unitLabel: null, estimatedTotal: null, actualTotal: null, bought: false },
  { id: 'unit', name: 'Soy sauce', category: 'Pantry', quantity: '2.000', unitLabel: 'bottles', estimatedTotal: null, actualTotal: null, bought: false },
  { id: 'dec', name: 'Chicken', category: 'Meat', quantity: '1.500', unitLabel: 'kg', estimatedTotal: null, actualTotal: null, bought: false },
  { id: 'done', name: 'Eggs', category: 'Dairy', quantity: '1.000', unitLabel: null, estimatedTotal: null, actualTotal: null, bought: true },
  { id: 'done2', name: 'Rice', category: 'Pantry', quantity: '2.000', unitLabel: null, estimatedTotal: null, actualTotal: null, bought: true },
]
function stepperFixture(patch) {
  const writes = []
  mockFetch((url, options) => {
    if (url.endsWith('/api/lists/trip-1') && !options.method) return json(seed(stepperItems))
    if (url.includes('/api/lists/trip-1/items/') && options.method === 'PATCH') {
      const body = JSON.parse(options.body)
      writes.push(body)
      const item = stepperItems.find((entry) => url.endsWith(entry.id))
      return patch ? patch(body, item) : json({ item: { ...item, ...body } })
    }
    throw new Error(`Unexpected request: ${url}`)
  })
  shoppingFixture(stepperItems)
  return writes
}

test('stepper shows on to-buy whole quantities only', async () => {
  stepperFixture()
  await screen.findByRole('checkbox', { name: 'Apples' })
  assert.ok(screen.getByRole('button', { name: 'Increase Apples quantity' }))
  assert.ok(screen.getByRole('button', { name: 'Decrease Apples quantity' }))
  assert.equal(screen.getByRole('group', { name: 'Apples quantity' }).textContent, '3')
  // Quantity 1 with no unit hides the number and can only go up.
  assert.ok(screen.getByRole('button', { name: 'Increase Milk quantity' }))
  assert.equal(screen.queryByRole('button', { name: 'Decrease Milk quantity' }), null)
  assert.equal(screen.getByRole('group', { name: 'Milk quantity' }).textContent, '')
  // The unit moves under the name; the number stays in the stepper.
  assert.equal(screen.getByRole('group', { name: 'Soy sauce quantity' }).textContent, '2')
  assert.match(screen.getByRole('button', { name: /Edit Soy sauce/ }).textContent, /bottles · Pantry/)
  // Decimals and bought rows stay plain text.
  assert.equal(screen.queryByRole('button', { name: 'Increase Chicken quantity' }), null)
  assert.match(screen.getByRole('button', { name: /Edit Chicken/ }).textContent, /1\.5 kg/)
  assert.equal(screen.queryByRole('button', { name: 'Increase Rice quantity' }), null)
  assert.match(screen.getByRole('button', { name: /Edit Rice/ }).textContent, /2$/)
  assert.doesNotMatch(screen.getByRole('button', { name: /Edit Eggs/ }).textContent, /1/)
})

test('stepping updates at once, saves the value and announces it', async () => {
  const writes = stepperFixture()
  fireEvent.click(await screen.findByRole('button', { name: 'Increase Apples quantity' }))
  assert.equal(screen.getByRole('group', { name: 'Apples quantity' }).textContent, '4')
  assert.ok(screen.getByText('Apples, quantity 4.'))
  await waitFor(() => assert.deepEqual(writes, [{ quantity: '4' }]))
})

test('stepping down to one hides the minus and moves focus to plus', async () => {
  const writes = stepperFixture()
  const minus = await screen.findByRole('button', { name: 'Decrease Soy sauce quantity' })
  minus.focus()
  fireEvent.click(minus)
  await waitFor(() => assert.ok(!screen.queryByRole('button', { name: 'Decrease Soy sauce quantity' })))
  assert.equal(screen.getByRole('group', { name: 'Soy sauce quantity' }).textContent, '1')
  await waitFor(() => assert.ok(document.activeElement === screen.getByRole('button', { name: 'Increase Soy sauce quantity' })))
  await waitFor(() => assert.deepEqual(writes, [{ quantity: '1' }]))
})

test('a failed step rolls back and shows a non-blocking error', async () => {
  stepperFixture(() => json({ error: 'nope' }, 500))
  fireEvent.click(await screen.findByRole('button', { name: 'Increase Apples quantity' }))
  assert.equal(screen.getByRole('group', { name: 'Apples quantity' }).textContent, '4')
  assert.match((await screen.findByRole('alert')).textContent, /Couldn't save that change/)
  assert.equal(screen.getByRole('group', { name: 'Apples quantity' }).textContent, '3')
  assert.ok(screen.getByRole('checkbox', { name: 'Apples' }))
})

test('tapping the name still opens the editor and hides that row stepper', async () => {
  stepperFixture()
  fireEvent.click(await screen.findByRole('button', { name: /Edit Apples/ }))
  assert.equal(screen.getByLabelText('Quantity').value, '3')
  assert.equal(screen.queryByRole('button', { name: 'Increase Apples quantity' }), null)
})

test('Finish waits for a pending quantity save', async () => {
  const pending = deferred()
  stepperFixture((body, item) => pending.promise.then(() => json({ item: { ...item, ...body } })))
  fireEvent.click(await screen.findByRole('button', { name: 'Increase Apples quantity' }))
  assert.equal(screen.getByRole('button', { name: 'Finish shopping' }).disabled, true)
  pending.resolve()
  await waitFor(() => assert.equal(screen.getByRole('button', { name: 'Finish shopping' }).disabled, false))
})

test('two taps before a re-render still count as two steps', async () => {
  const { act } = await import('@testing-library/react')
  stepperFixture()
  const plus = await screen.findByRole('button', { name: 'Increase Apples quantity' })
  act(() => { plus.click(); plus.click() })
  assert.equal(screen.getByRole('group', { name: 'Apples quantity' }).textContent, '5')
})

test('adds show at once, keep the field free, and save one at a time in order', async () => {
  const started = []
  const finishers = []
  typedItemFixture({
    catalog: [{ id: 'p-1', name: 'Eggs', category: 'Dairy' }, { id: 'p-2', name: 'Milk', category: 'Dairy' }],
    onQuickAdd: (id) => { started.push(id); return new Promise((resolve) => finishers.push(resolve)) },
  })
  const field = await typeInFind('eggs')
  await screen.findByRole('button', { name: 'Add Eggs' })
  fireEvent.keyDown(field, { key: 'Enter' })
  assert.equal(field.value, '')
  assert.ok(await screen.findByText('Eggs'))
  fireEvent.change(field, { target: { value: 'milk' } })
  await screen.findByRole('button', { name: 'Add Milk' })
  fireEvent.keyDown(field, { key: 'Enter' })
  assert.ok(await screen.findByText('Milk'))
  await waitFor(() => assert.deepEqual(started, ['p-1']))
  assert.equal(screen.getByRole('checkbox', { name: 'Eggs' }).disabled, true)
  finishers[0]()
  await waitFor(() => assert.deepEqual(started, ['p-1', 'p-2']))
  finishers[1]()
  await waitFor(() => assert.ok(!screen.queryByRole('checkbox', { name: 'Milk' })))
})

test('a typed add shows at once on a list that has a row with no catalog link', async () => {
  const pending = deferred()
  typedItemFixture({
    items: [{ id: 'i-1', productId: null, name: 'Rice', category: 'Pantry', quantity: '1', unitLabel: null, estimatedTotal: null, actualTotal: null, bought: false }],
    createResponse: () => pending.promise,
    onQuickAdd: async () => {},
  })
  await screen.findByRole('checkbox', { name: 'Rice' })
  const field = await typeInFind('Kimchi')
  await screen.findByRole('button', { name: /Add .*Kimchi/ })
  fireEvent.keyDown(field, { key: 'Enter' })
  assert.ok(await screen.findByText('Kimchi'))
  pending.resolve(json({ item: { id: 'new-1', name: 'Kimchi', category: 'Other', source: 'custom' } }, 201))
})

test('a failed add removes the row, names it and returns it to an empty field', async () => {
  typedItemFixture({
    catalog: [{ id: 'p-1', name: 'Eggs', category: 'Dairy' }],
    onQuickAdd: async () => { throw new Error('Offline') },
  })
  const field = await typeInFind('eggs')
  await screen.findByRole('button', { name: 'Add Eggs' })
  fireEvent.keyDown(field, { key: 'Enter' })
  assert.match((await screen.findByRole('alert')).textContent, /We could not add Eggs\. Offline/)
  assert.equal(field.value, 'Eggs')
  assert.equal(screen.queryByRole('checkbox', { name: 'Eggs' }), null)
})

test('a typed list adds exact matches, creates the rest and reports what is on the list', async () => {
  const added = []
  const posts = []
  typedItemFixture({
    catalog: [{ id: 'p-1', name: 'Eggs', category: 'Dairy' }, { id: 'p-2', name: 'Hamburger buns', category: 'Bakery' }, { id: 'p-3', name: 'Rice', category: 'Pantry' }],
    items: [{ ...cartItem, id: 'on-list', name: 'Rice', productId: 'p-3' }],
    onQuickAdd: async (id) => { added.push(id) },
    createResponse: (body) => { posts.push(body); return json({ item: { id: 'new-1', ...body } }, 201) },
  })
  const field = await typeInFind('egg, ham, rice')
  fireEvent.click(await screen.findByRole('button', { name: /^Add 3 items/ }))
  assert.equal(field.value, '')
  await waitFor(() => assert.deepEqual(added, ['p-1', 'new-1']))
  assert.deepEqual(posts, [{ name: 'ham', category: 'Other' }])
  assert.ok(screen.getByText('Already on this list: rice.'))
})
