import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Node = dom.window.Node
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const React = await import('react')
const { act, render, screen, fireEvent, cleanup, waitFor } = await import('@testing-library/react')
const { createServer } = await import('vite')
const vite = await createServer({ configFile: 'vite.config.js', server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const { DataCacheProvider } = await vite.ssrLoadModule('/src/dataCache.jsx')
const { createDataCache } = await vite.ssrLoadModule('/src/dataCache.js')
const { default: ShoppingList } = await vite.ssrLoadModule('/src/ShoppingList.jsx')
test.afterEach(() => cleanup())
test.after(async () => { await vite.close(); dom.window.close(); globalThis.fetch = undefined })

const entry = (id, name, bought) => ({ id, name, category: 'Dairy', quantity: '1', bought, estimatedTotal: null, actualTotal: null })
const milk = entry('milk', 'Milk', true)
const eggs = entry('eggs', 'Eggs', false)
const rice = entry('rice', 'Rice', false)
const json = (body) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

function setup({ items = [milk, eggs, rice], finish, loadList, kept = items.filter((item) => !item.bought) } = {}) {
  const cart = { tripId: 'active', name: 'Weekly Groceries', status: 'active', revision: 1, currency: 'PHP', budget: null, items }
  const fresh = { ...cart, revision: 42 }
  const reducedList = { ...fresh, revision: 43, items: kept }
  const completed = { id: 'trip-9', name: cart.name, revision: 1, currency: 'PHP', completedAt: '2026-10-04T00:00:00Z', items, summary: {} }
  const cache = createDataCache()
  cache.set('list:active', cart)
  cache.set('lists', { items: [{ id: 'active', name: cart.name }, { id: 'other', name: 'Party Supplies' }], nextCursor: null })
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    if (url === '/api/lists/active') return json(loadList ? loadList({ fresh, reducedList }) : fresh)
    if (url === '/api/lists') return json({ items: [{ tripId: 'active', name: cart.name }, { tripId: 'other', name: 'Party Supplies' }], nextCursor: null })
    if (url === '/api/catalog') return json({ items: [] })
    if (url === '/api/trips') return json({ items: [], nextCursor: null })
    if (url === '/api/trips/active/finish') return finish ? finish({ completed, reducedList }) : json({ completedTrip: completed, list: reducedList })
    throw new Error(`Unexpected request ${url}`)
  }
  const handlers = { backToLists: [], openedTrips: [] }
  render(React.createElement(DataCacheProvider, { cache }, React.createElement(ShoppingList, { listId: 'active',
    onBackToLists: (result) => handlers.backToLists.push(result), onOpenTrip: (id) => handlers.openedTrips.push(id),
    onEditHandled: () => {}, onBrowseCatalog: () => {}, onMutationPending: () => {}, onReviewChange: () => {} })))
  const finishBody = () => JSON.parse(calls.find(({ url }) => url.endsWith('/finish')).options.body)
  return { cache, calls, handlers, reducedList, finishBody }
}

async function openReview() {
  fireEvent.click(screen.getByRole('button', { name: 'Finish shopping' }))
  await screen.findByRole('heading', { name: 'Finish shopping?' })
  // The review's freeze starts in an effect, which can run just after the heading appears.
  await act(async () => {})
}
const confirm = () => fireEvent.click(screen.getByRole('button', { name: 'Confirm and finish' }))

test('Finish keeps the list and links to the new trip', async () => {
  const { cache, calls, handlers, reducedList, finishBody } = setup()
  await openReview()
  assert.equal(calls.filter(({ url }) => url === '/api/lists/active').length, 1)
  let replaced = false
  await cache.load('list:active', () => { replaced = true; return Promise.resolve({ revision: 99 }) }, { force: true })
  assert.equal(replaced, false, 'review blocks even a forced background replacement')
  confirm()
  await screen.findByText(/Trip saved/)
  assert.deepEqual(handlers.backToLists, [])
  assert.deepEqual(finishBody(), { revision: 42, remaining: 'keep' })
  assert.deepEqual(calls.filter(({ options }) => options.method === 'POST').map(({ url }) => url), ['/api/trips/active/finish'])
  assert.deepEqual(cache.get('list:active').data, reducedList)
  assert.equal(cache.get('trip:trip-9').data.trip.id, 'trip-9')
  assert.equal(cache.get('trips').data.items[0].id, 'trip-9')
  assert.deepEqual(cache.get('lists').data.items.map((item) => item.id ?? item.tripId), ['active', 'other'])
  assert.ok(screen.getByRole('heading', { name: 'Weekly Groceries' }))
  assert.ok(screen.getByText('Eggs'))
  assert.equal(screen.queryByText('Milk'), null)
  fireEvent.click(screen.getByRole('button', { name: 'View trip' }))
  assert.deepEqual(handlers.openedTrips, ['trip-9'])
})

test('Keep is the default and Clear the list sends clear', async () => {
  const { finishBody } = setup({ kept: [] })
  await openReview()
  assert.equal(screen.getByRole('radio', { name: 'Keep the 2 not-bought items on this list' }).checked, true)
  assert.equal(screen.getByRole('radio', { name: 'Clear the list' }).checked, false)
  fireEvent.click(screen.getByRole('radio', { name: 'Clear the list' }))
  confirm()
  await screen.findByText(/Trip saved/)
  assert.equal(finishBody().remaining, 'clear')
})

test('The choice uses a singular label for one item', async () => {
  setup({ items: [milk, eggs] })
  await openReview()
  assert.ok(screen.getByRole('radio', { name: 'Keep the 1 not-bought item on this list' }))
})

test('Everything bought shows no choice and still confirms', async () => {
  const { finishBody, handlers } = setup({ items: [milk] })
  await openReview()
  assert.equal(screen.queryAllByRole('radio').length, 0)
  confirm()
  await screen.findByText(/Trip saved/)
  assert.equal(finishBody().remaining, 'keep')
  fireEvent.click(screen.getByRole('button', { name: 'View trip' }))
  assert.deepEqual(handlers.openedTrips, ['trip-9'])
})

test('Backing out of the review resets the choice', async () => {
  setup()
  await openReview()
  fireEvent.click(screen.getByRole('radio', { name: 'Clear the list' }))
  fireEvent.click(screen.getByRole('button', { name: 'Keep shopping' }))
  await openReview()
  assert.equal(screen.getByRole('radio', { name: 'Keep the 2 not-bought items on this list' }).checked, true)
})

test('Confirming again after a lost connection finishes normally', async () => {
  let attempts = 0
  const { finishBody } = setup({ finish: ({ completed, reducedList }) => {
    attempts += 1
    if (attempts === 1) throw new TypeError('Failed to fetch')
    return json({ completedTrip: completed, list: reducedList })
  } })
  await openReview()
  confirm()
  await screen.findByRole('alert')
  assert.match(screen.getByRole('alert').textContent, /will not create a duplicate/)
  confirm()
  await screen.findByText(/Trip saved/)
  assert.equal(attempts, 2)
  assert.equal(finishBody().revision, 42)
})

// The server saved the trip, but its first response never arrived.
function savedButResponseLost(overrides = {}) {
  let saved = false
  return setup({
    finish: ({ completed, reducedList }) => {
      if (!saved) { saved = true; throw new TypeError('Failed to fetch') }
      return json({ completedTrip: completed, list: reducedList })
    },
    loadList: ({ fresh, reducedList }) => saved ? reducedList : fresh,
    ...overrides,
  })
}

test('Keep shopping after a lost response finds the saved trip', async () => {
  const { handlers, calls } = savedButResponseLost()
  await openReview()
  confirm()
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: 'Keep shopping' }))
  await screen.findByText(/Trip saved/)
  assert.equal(calls.filter(({ url }) => url.endsWith('/finish')).every(({ options }) => JSON.parse(options.body).revision === 42), true)
  assert.equal(screen.queryByText('Milk'), null)
  fireEvent.click(screen.getByRole('button', { name: 'View trip' }))
  assert.deepEqual(handlers.openedTrips, ['trip-9'])
})

test('Escape after a lost response finds the saved trip', async () => {
  savedButResponseLost()
  await openReview()
  confirm()
  await screen.findByRole('alert')
  fireEvent.keyDown(document, { key: 'Escape' })
  await screen.findByText(/Trip saved/)
})

test('Reopening the review after an offline back-out finds the saved trip', async () => {
  let offline = false
  const { calls } = savedButResponseLost({
    finish: ({ completed, reducedList }) => {
      if (!offline) { offline = true; throw new TypeError('Failed to fetch') }
      return json({ completedTrip: completed, list: reducedList })
    },
    loadList: ({ fresh, reducedList }) => {
      if (!offline) return fresh
      if (offline === true) { offline = 'reconnected'; throw new TypeError('Failed to fetch') }
      return reducedList
    },
  })
  await openReview()
  confirm()
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: 'Keep shopping' }))
  await waitFor(() => assert.equal(offline, 'reconnected'))
  fireEvent.click(screen.getByRole('button', { name: 'Finish shopping' }))
  await screen.findByText(/Trip saved/)
  assert.equal(screen.queryByRole('heading', { name: 'Finish shopping?' }), null)
  assert.equal(calls.filter(({ url }) => url.endsWith('/finish')).length, 2)
})

test('Backing out when nothing was saved changes nothing', async () => {
  const { calls } = setup({ finish: () => { throw new TypeError('Failed to fetch') } })
  await openReview()
  confirm()
  await screen.findByRole('alert')
  const loads = calls.filter(({ url }) => url === '/api/lists/active').length
  fireEvent.click(screen.getByRole('button', { name: 'Keep shopping' }))
  await waitFor(() => assert.ok(calls.filter(({ url }) => url === '/api/lists/active').length > loads))
  await screen.findByText('Milk')
  assert.equal(calls.filter(({ url }) => url.endsWith('/finish')).length, 1)
  assert.equal(screen.queryByText(/Trip saved/), null)
})

test('Tabbing around the review reaches the checked choice', async () => {
  setup()
  await openReview()
  const summaries = document.querySelectorAll('.review-group summary')
  summaries[summaries.length - 1].focus()
  fireEvent.keyDown(document, { key: 'Tab' })
  assert.equal(document.activeElement, screen.getByRole('radio', { name: 'Keep the 2 not-bought items on this list' }))
})

test('A trip completed before this change returns to My Lists', async () => {
  const { cache, handlers } = setup({ finish: ({ completed }) => json({ completedTrip: completed, list: null }) })
  await openReview()
  confirm()
  await waitFor(() => assert.equal(handlers.backToLists.length, 1))
  assert.deepEqual(handlers.backToLists[0], { notice: 'Weekly Groceries is saved in Trips.', tripId: 'trip-9' })
  assert.deepEqual(cache.get('lists').data.items.map((item) => item.id ?? item.tripId), ['other'])
})
