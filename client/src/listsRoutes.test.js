import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/lists' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Node = dom.window.Node
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react')
const { createServer } = await import('vite')
const vite = await createServer({ configFile: 'vite.config.js', server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const { default: App } = await vite.ssrLoadModule('/src/App.jsx')

test.afterEach(() => { cleanup(); globalThis.fetch = undefined; window.history.replaceState(null, '', '/lists') })
test.after(async () => { await vite.close(); dom.window.close() })

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const user = { id: 'user-1', email: 'person@example.test', email_verified: true, verification_required: false, preferred_currency: 'PHP' }

function mockAppFetch({ listPage = { items: [], nextCursor: null }, listDetail = null, tripPage = { items: [], nextCursor: null }, tripDetail = null } = {}) {
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url)
    calls.push({ path, options })
    if (path.endsWith('/api/auth/me')) return json({ user })
    if (path.endsWith('/api/lists')) return json(listPage)
    if (/\/api\/lists\/[^/]+$/.test(path)) return listDetail ? json(listDetail) : json({ error: 'List not found' }, 404)
    if (path.endsWith('/api/catalog')) return json({ items: [] })
    if (path.endsWith('/api/trips')) return json(tripPage)
    if (/\/api\/trips\/[^/]+$/.test(path)) return tripDetail ? json(tripDetail) : json({ error: 'Trip not found' }, 404)
    throw new Error(`Unexpected request: ${path}`)
  }
  return calls
}

test('active overview normalizes tripId and nested summary fields from fetched summaries', async () => {
  mockAppFetch({ listPage: { items: [{ tripId: 'grocery-1', name: 'Summer groceries', currency: 'PHP', budget: null, itemCount: 4, boughtCount: 2, notBoughtCount: 2, updatedAt: '2026-08-01T00:00:00Z', summary: { estimatedTotal: null, estimatedMissingCount: 4, actualTotal: '12.00', actualMissingCount: 1 } }], nextCursor: null } })
  render(React.createElement(App))
  await screen.findByRole('heading', { name: 'My Lists' })
  const card = await screen.findByRole('button', { name: /Summer groceries/ })
  assert.match(card.textContent, /2 of 4 bought/)
  assert.doesNotMatch(card.textContent, /Estimated/)
  assert.match(card.textContent, /Actual spending ₱12\.00 · incomplete/)
})

test('a completed list bookmark resolves to named read-only history details', async () => {
  const completed = { id: 'trip-88', name: 'Holiday run', status: 'completed', currency: 'USD', completedAt: '2026-09-21T00:00:00Z', revision: 3, items: [{ id: 'saved-1', name: 'Oats', category: 'Pantry', quantity: '1', bought: true, estimatedTotal: null, actualTotal: '0.00' }], summary: { actualTotal: '0.00', actualMissingCount: 0, estimatedTotal: null, estimatedMissingCount: 1 } }
  window.history.replaceState(null, '', '/lists/trip-88')
  const calls = mockAppFetch({ listDetail: { completedTrip: completed }, tripPage: { items: [{ ...completed, itemCount: 1, boughtCount: 1, notBoughtCount: 0 }], nextCursor: null }, tripDetail: { trip: completed } })
  render(React.createElement(App))
  await screen.findByRole('heading', { name: 'Holiday run' })
  assert.ok(await screen.findByText('Oats'))
  assert.ok(calls.some((call) => call.path.endsWith('/api/lists/trip-88')))
  assert.ok(calls.some((call) => call.path.endsWith('/api/trips/trip-88')))
  assert.ok(screen.getAllByRole('button', { name: 'My Lists' }).length >= 2)
})

test('malformed percent escapes in a bookmarked list route render an owner-safe error', async () => {
  window.history.replaceState(null, '', '/lists/%')
  const calls = mockAppFetch()
  render(React.createElement(App))
  await screen.findByRole('alert')
  assert.ok(calls.some((call) => call.path.endsWith('/api/lists/%25')))
})

test('shop again starts a new list from the not-bought items of a finished trip', async () => {
  const completed = { id: 'trip-88', name: 'Holiday run', status: 'completed', currency: 'PHP', completedAt: '2026-09-21T00:00:00Z', revision: 3, items: [{ id: 's1', name: 'Oats', category: 'Pantry', quantity: '1.000', bought: true, estimatedTotal: null, actualTotal: '5.00' }, { id: 's2', name: 'Milk', category: 'Dairy', quantity: '2.000', unitLabel: 'L', bought: false, estimatedTotal: null, actualTotal: null }], summary: { actualTotal: '5.00', actualMissingCount: 0, estimatedTotal: null, estimatedMissingCount: 2 } }
  const fresh = { tripId: 'list-90', name: 'Next run', status: 'active', currency: 'PHP', budget: null, revision: 1, items: [{ id: 'n1', productId: null, name: 'Milk', category: 'Dairy', quantity: '2.000', unitLabel: 'L', bought: false, estimatedTotal: null, actualTotal: null }] }
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url)
    calls.push({ path, options })
    if (path.endsWith('/api/auth/me')) return json({ user })
    if (path.endsWith('/api/lists')) return json({ items: [], nextCursor: null })
    if (path.endsWith('/api/lists/trip-88')) return json({ completedTrip: completed })
    if (path.endsWith('/api/lists/list-90')) return json(fresh)
    if (path.endsWith('/api/catalog')) return json({ items: [] })
    if (path.endsWith('/api/trips')) return json({ items: [], nextCursor: null })
    if (path.endsWith('/api/trips/trip-88')) return json({ trip: completed })
    if (path.endsWith('/api/trips/trip-88/reuse')) return json(fresh, 201)
    throw new Error(`Unexpected request: ${path}`)
  }
  window.history.replaceState(null, '', '/lists/trip-88')
  render(React.createElement(App))
  fireEvent.click(await screen.findByRole('button', { name: 'Shop again' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Only the 1 not bought' }))
  fireEvent.change(screen.getByLabelText('List name'), { target: { value: ' Next run ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create list' }))
  await screen.findByRole('heading', { name: 'Next run' })
  const post = calls.find((call) => call.path.endsWith('/reuse'))
  assert.deepEqual(JSON.parse(post.options.body), { items: 'notBought', name: 'Next run' })
  assert.equal(window.location.pathname, '/lists/list-90')
  assert.equal(screen.getByRole('checkbox', { name: 'Milk' }).checked, false)
})

test('deleting a list asks inline and Keep leaves it in place', async () => {
  const calls = mockAppFetch({ listPage: { items: [{ tripId: 'grocery-1', name: 'Summer groceries', currency: 'PHP', budget: null, itemCount: 0, boughtCount: 0, notBoughtCount: 0, updatedAt: '2026-08-01T00:00:00Z', summary: {} }], nextCursor: null } })
  render(React.createElement(App))
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
  const prompt = screen.getByRole('group', { name: 'Delete Summer groceries?' })
  assert.match(prompt.textContent, /Trip history is unaffected/)
  fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
  assert.ok(screen.getByRole('button', { name: /Summer groceries/ }))
  await waitFor(() => assert.equal(document.activeElement, screen.getByRole('button', { name: 'Delete' })))
  assert.equal(calls.some((call) => call.options.method === 'DELETE'), false)
})

test('a trip link opens under Trips, names the page and returns to history', async () => {
  const completed = { id: 'trip-88', name: 'Holiday run', status: 'completed', currency: 'PHP', completedAt: '2026-09-21T00:00:00Z', revision: 3, items: [{ id: 's1', name: 'Oats', category: 'Pantry', quantity: '1', bought: true, estimatedTotal: null, actualTotal: null }], summary: { actualTotal: null, actualMissingCount: 1, estimatedTotal: null, estimatedMissingCount: 1 } }
  mockAppFetch({ tripPage: { items: [{ ...completed, itemCount: 1, boughtCount: 1, notBoughtCount: 0 }], nextCursor: null }, tripDetail: { trip: completed } })
  window.history.replaceState(null, '', '/trips/trip-88')
  render(React.createElement(App))
  await screen.findByRole('heading', { name: 'Holiday run' })
  const nav = screen.getByRole('navigation', { name: 'Main navigation' })
  assert.equal([...nav.querySelectorAll('[aria-current="page"]')].map((button) => button.textContent).join(), 'Trips')
  await waitFor(() => assert.equal(document.title, 'Holiday run · CartCheck'))
  fireEvent.click(screen.getByRole('button', { name: 'All trips' }))
  await screen.findByRole('heading', { name: 'Trips' })
  assert.ok(screen.getByRole('button', { name: 'Shop again from Holiday run' }))
})

test('a new list can start from the not-bought items of the last trip with its own budget', async () => {
  const last = { id: 'trip-7', name: 'Saturday', completedAt: '2026-10-24T00:00:00Z', currency: 'PHP', itemCount: 3, boughtCount: 1, notBoughtCount: 2, summary: {} }
  const created = { tripId: 'list-9', name: 'Next shop', status: 'active', currency: 'PHP', budget: null, revision: 1, items: [] }
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url)
    calls.push({ path, options })
    if (path.endsWith('/api/auth/me')) return json({ user })
    if (path.endsWith('/api/lists') && !options.method) return json({ items: [], nextCursor: null })
    if (path.endsWith('/api/catalog')) return json({ items: [] })
    if (path.endsWith('/api/trips')) return json({ items: [last], nextCursor: null })
    if (path.endsWith('/api/trips/trip-7/reuse')) return json(created, 201)
    if (path.endsWith('/api/lists/list-9') && options.method === 'PATCH') return json({ ...created, budget: '500.00', revision: 2 })
    if (path.endsWith('/api/lists/list-9')) return json({ ...created, budget: '500.00', revision: 2 })
    throw new Error(`Unexpected request: ${path} ${options.method}`)
  }
  render(React.createElement(App))
  fireEvent.click(await screen.findByRole('button', { name: 'Create list' }))
  fireEvent.change(screen.getByLabelText('List name'), { target: { value: 'Next shop' } })
  fireEvent.change(await screen.findByLabelText('Start with'), { target: { value: 'notBought' } })
  assert.equal(screen.getByLabelText('Currency').disabled, true)
  fireEvent.change(screen.getByLabelText('Budget (optional)'), { target: { value: '500' } })
  fireEvent.submit(screen.getByLabelText('List name').closest('form'))
  await waitFor(() => assert.equal(window.location.pathname, '/lists/list-9'))
  assert.deepEqual(JSON.parse(calls.find((call) => call.path.endsWith('/reuse')).options.body), { items: 'notBought', name: 'Next shop' })
  assert.deepEqual(JSON.parse(calls.find((call) => call.options.method === 'PATCH').options.body), { budget: '500.00' })
})
