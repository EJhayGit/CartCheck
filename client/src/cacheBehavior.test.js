import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Node = dom.window.Node
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { act, cleanup, fireEvent, render, screen, waitFor, within } = await import('@testing-library/react')
const React = await import('react')
const { createServer } = await import('vite')
const vite = await createServer({ configFile: 'vite.config.js', server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const { default: Catalog } = await vite.ssrLoadModule('/src/Catalog.jsx')
const { DataCacheProvider } = await vite.ssrLoadModule('/src/dataCache.jsx')
const { default: App } = await vite.ssrLoadModule('/src/App.jsx')
const { getLists } = await vite.ssrLoadModule('/src/api/httpApi.js')

test.afterEach(() => {
  cleanup()
  window.history.replaceState({}, '', '/')
  globalThis.fetch = undefined
  window.confirm = () => true
})

test.after(async () => {
  await vite.close()
  dom.window.close()
})

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function mockFetch(handler) {
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    const actualUrl = String(url)
    calls.push({ url: actualUrl, options })
    let legacyUrl = actualUrl
    if (actualUrl === '/api/lists' || /^\/api\/lists\/[^/]+$/.test(actualUrl)) legacyUrl = '/api/cart'
    else if (/^\/api\/lists\/[^/]+\/items(?:\/[^/]+)?$/.test(actualUrl)) legacyUrl = actualUrl.replace(/^\/api\/lists\/[^/]+\/items/, '/api/cart/items')
    let response = await handler(legacyUrl, options)
    if (!response?.ok || !response?.json || response.status === 204) return response
    const payload = await response.clone().json()
    if (actualUrl === '/api/lists' && !options.method) {
      return json(payload.tripId ? { items: [{ ...payload, id: payload.tripId, name: payload.name || 'Groceries', itemCount: payload.items?.length || 0, boughtCount: payload.items?.filter((item) => item.bought).length || 0 }], nextCursor: null } : { items: [], nextCursor: null })
    }
    if (/^\/api\/lists\/[^/]+$/.test(actualUrl) && !options.method && payload.tripId) return json({ ...payload, name: payload.name || 'Groceries' })
    return response
  }
  return calls
}

const groceries = [
  { id: '1', name: 'Milk', category: 'Dairy & eggs', source: 'starter' },
  { id: '2', name: 'Millet', category: 'Pantry', source: 'starter' },
  { id: '3', name: 'Rice', category: 'Pantry', source: 'starter' },
]

const user = { id: 'shopper-1', email: 'shopper@example.test', email_verified: true, verification_required: false, preferred_currency: 'PHP' }
const cart = { items: [{ id: 'cart-1', name: 'Milk', category: 'Dairy', quantity: '1', unitLabel: '', estimatedTotal: null, actualTotal: null, bought: false }], currency: 'PHP', budget: null, tripId: 'trip-current', revision: 1 }
const emptyTrips = { items: [], hasMorePages: false, nextCursor: null }

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const appResponse = (url) => {
  if (url.endsWith('/api/auth/me')) return json({ user })
  if (url.endsWith('/api/cart')) return json(cart)
  if (url.endsWith('/api/catalog')) return json({ items: groceries })
  if (url.endsWith('/api/trips')) return json(emptyTrips)
  throw new Error(`Unexpected request: ${url}`)
}

async function openApp(calls) {
  render(React.createElement(App))
  await screen.findByRole('heading', { name: 'My Lists' })
  await waitFor(() => assert.equal(calls.filter((call) => call.url === '/api/lists' && !call.options.method).length, 1))
  fireEvent.click(await screen.findByRole('button', { name: /Groceries/ }))
  await screen.findByRole('heading', { name: 'Groceries' })
}

function appNav(name) {
  return within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('button', { name })
}

test('StrictMode prefetches each private collection once and catalog search/filter stays local', async () => {
  const calls = mockFetch((url) => {
    if (url.endsWith('/api/catalog')) return json({ items: groceries })
    if (url.endsWith('/api/cart')) return json({ items: [], currency: 'PHP', budget: null, tripId: null, revision: 0 })
    if (url.endsWith('/api/trips')) return json({ items: [], hasMorePages: false, nextCursor: null })
    throw new Error(`Unexpected request: ${url}`)
  })
  const view = render(React.createElement(React.StrictMode, null,
    React.createElement(DataCacheProvider, null, React.createElement(Catalog, { active: true, onAdd: async () => ({}), onAddPending: () => {} }))))
  await screen.findByText('Milk')
  await waitFor(() => assert.equal(calls.filter((call) => call.url.endsWith('/api/catalog')).length, 1))
  assert.equal(calls.filter((call) => call.url === '/api/lists' && !call.options.method).length, 1)
  assert.equal(calls.filter((call) => call.url.endsWith('/api/trips')).length, 1)

  const search = screen.getByLabelText('Search catalog')
  for (const term of ['m', 'mi', 'mil', 'milk']) {
    fireEvent.change(search, { target: { value: term } })
    assert.ok(screen.getByText('Milk'))
  }
  assert.equal(screen.queryByText('Rice'), null)
  fireEvent.change(search, { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Pantry' }))
  assert.equal(screen.getByText('Millet').textContent, 'Millet')
  assert.equal(screen.queryByText('Milk'), null)
  assert.equal(calls.length, 3)
  view.unmount()
})

test('catalog content remains visible when a repeated view uses the warm cache during transport failure', async () => {
  let offline = false
  const calls = mockFetch((url) => {
    if (offline) return Promise.reject(new TypeError('offline'))
    if (url.endsWith('/api/catalog')) return json({ items: groceries })
    if (url.endsWith('/api/cart')) return json({ items: [], currency: 'PHP', budget: null, tripId: null, revision: 0 })
    if (url.endsWith('/api/trips')) return json({ items: [], hasMorePages: false, nextCursor: null })
    throw new Error(`Unexpected request: ${url}`)
  })
  function Shell() {
    const [visible, setVisible] = React.useState(true)
    return React.createElement(React.Fragment, null,
      React.createElement('button', { type: 'button', onClick: () => setVisible((value) => !value) }, visible ? 'Hide catalog' : 'Show catalog'),
      visible ? React.createElement(Catalog, { active: true, onAdd: async () => ({}), onAddPending: () => {} }) : null)
  }
  render(React.createElement(DataCacheProvider, null, React.createElement(Shell)))
  await screen.findByText('Milk')
  offline = true
  fireEvent.click(screen.getByRole('button', { name: 'Hide catalog' }))
  fireEvent.click(screen.getByRole('button', { name: 'Show catalog' }))
  assert.ok(await screen.findByText('Milk'))
  assert.equal(calls.filter((call) => call.url.endsWith('/api/catalog')).length, 1)
})

test('authenticated startup launches lists, catalog, and trip reads in parallel', async () => {
  const pending = { cart: deferred(), catalog: deferred(), trips: deferred() }
  const calls = mockFetch((url) => {
    if (url.endsWith('/api/auth/me')) return json({ user })
    if (url.endsWith('/api/cart')) return pending.cart.promise
    if (url.endsWith('/api/catalog')) return pending.catalog.promise
    if (url.endsWith('/api/trips')) return pending.trips.promise
    throw new Error(`Unexpected request: ${url}`)
  })
  render(React.createElement(App))
  await waitFor(() => {
    for (const route of ['/api/lists', '/api/catalog', '/api/trips']) assert.equal(calls.filter((call) => call.url.endsWith(route)).length, 1)
  })
  // All three transports are outstanding before any fixture is released.
  assert.deepEqual(Object.values(pending).map((request) => request.promise instanceof Promise), [true, true, true])
  pending.cart.resolve(json(cart))
  pending.catalog.resolve(json({ items: groceries }))
  pending.trips.resolve(json(emptyTrips))
  await screen.findByRole('heading', { name: 'My Lists' })
  fireEvent.click(await screen.findByRole('button', { name: /Groceries/ }))
  await screen.findByText('Milk')
})

test('App screen loop reuses warm list/catalog/trip data when later reads are offline', async () => {
  let offline = false
  const calls = mockFetch((url, options) => {
    if (offline && ['/api/cart', '/api/catalog', '/api/trips'].some((route) => url.endsWith(route))) return Promise.reject(new TypeError('offline'))
    return appResponse(url, options)
  })
  await openApp(calls)
  fireEvent.click(appNav('Catalog'))
  await screen.findAllByText('Milk')
  fireEvent.click(appNav('Trips'))
  await screen.findByRole('heading', { name: 'No finished trips yet' })
  fireEvent.click(appNav('Settings'))
  await screen.findByRole('heading', { name: 'Settings' })
  offline = true
  fireEvent.click(appNav('My Lists'))
  assert.ok(await screen.findByRole('button', { name: /Groceries/ }))
  fireEvent.click(appNav('Catalog'))
  assert.ok(screen.queryAllByText('Milk').length)
  fireEvent.click(appNav('Trips'))
  assert.ok(screen.getByRole('heading', { name: 'No finished trips yet' }))
  assert.equal(calls.filter((call) => ['/api/lists', '/api/catalog', '/api/trips'].some((route) => call.url.endsWith(route))).length, 3)
})

test('trip detail stays cached when closed and reopened', async () => {
  const summary = { id: 'finished-1', completedAt: '2026-01-02T00:00:00.000Z', currency: 'PHP', itemCount: 1, boughtCount: 1, notBoughtCount: 0, summary: { actualTotal: '12.00', actualMissingCount: 0, estimatedTotal: '10.00', estimatedMissingCount: 0 } }
  const detail = { trip: { ...summary, items: [{ id: 'old-item', name: 'Milk', category: 'Dairy', quantity: '1', bought: true, estimatedTotal: '10.00', actualTotal: '12.00' }] } }
  const calls = mockFetch((url) => {
    if (url.endsWith('/api/auth/me')) return json({ user })
    if (url.endsWith('/api/cart')) return json(cart)
    if (url.endsWith('/api/catalog')) return json({ items: groceries })
    if (url.endsWith('/api/trips')) return json({ items: [summary], hasMorePages: false, nextCursor: null })
    if (url.endsWith('/api/trips/finished-1')) return json(detail)
    throw new Error(`Unexpected request: ${url}`)
  })
  await openApp(calls)
  fireEvent.click(appNav('Trips'))
  fireEvent.click(await screen.findByRole('button', { name: 'View details' }))
  assert.ok((await screen.findAllByText('Milk')).length)
  fireEvent.click(screen.getByRole('button', { name: 'Back to history' }))
  await screen.findByRole('button', { name: 'View details' })
  fireEvent.click(screen.getByRole('button', { name: 'View details' }))
  assert.ok((await screen.findAllByText('Milk')).length)
  assert.equal(calls.filter((call) => call.url.endsWith('/api/trips/finished-1')).length, 1)
})

test('failed history pagination keeps existing trips and retries the same cursor', async () => {
  const first = { id: 'finished-1', completedAt: '2026-01-02T00:00:00.000Z', currency: 'PHP', itemCount: 1, boughtCount: 1, notBoughtCount: 0, summary: { actualTotal: '12.00', actualMissingCount: 0 } }
  const second = { ...first, id: 'finished-2' }
  let pageAttempts = 0
  const calls = mockFetch((url) => {
    if (url.endsWith('/api/auth/me')) return json({ user })
    if (url.endsWith('/api/cart')) return json(cart)
    if (url.endsWith('/api/catalog')) return json({ items: groceries })
    if (url.endsWith('/api/trips')) return json({ items: [first], hasMorePages: true, nextCursor: 'cursor-2' })
    if (url.endsWith('/api/trips?cursor=cursor-2')) {
      pageAttempts++
      return pageAttempts === 1 ? json({ error: 'temporarily unavailable' }, 503) : json({ items: [second], hasMorePages: false, nextCursor: null })
    }
    throw new Error(`Unexpected request: ${url}`)
  })
  await openApp(calls)
  fireEvent.click(appNav('Trips'))
  await screen.findByText('1 items · 1 bought · 0 not bought')
  fireEvent.click(screen.getByRole('button', { name: 'Load more trips' }))
  await screen.findByRole('alert')
  assert.ok(screen.getByText('1 items · 1 bought · 0 not bought'))
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => assert.equal(screen.getAllByText('1 items · 1 bought · 0 not bought').length, 2))
  assert.equal(pageAttempts, 2)
  assert.equal(calls.filter((call) => call.url.includes('cursor=cursor-2')).length, 2)
})

test('failed correction reload preserves the draft and review; successful reload replaces it with fresh details', async () => {
  const summary = { id: 'finished-1', completedAt: '2026-01-02T00:00:00.000Z', currency: 'PHP', itemCount: 1, boughtCount: 1, notBoughtCount: 0, summary: { actualTotal: '12.00', actualMissingCount: 0, estimatedTotal: '10.00', estimatedMissingCount: 0 } }
  const makeDetails = (itemName, revision) => ({ trip: { ...summary, revision, items: [{ id: 'saved-item', name: itemName, category: 'Dairy', quantity: '1', unitLabel: '', bought: true, estimatedTotal: '10.00', actualTotal: '12.00' }] } })
  let detailGets = 0
  const refreshed = deferred()
  const calls = mockFetch((url, options) => {
    if (url.endsWith('/api/auth/me')) return json({ user })
    if (url.endsWith('/api/cart')) return json(cart)
    if (url.endsWith('/api/catalog')) return json({ items: groceries })
    if (url.endsWith('/api/trips') && options.method !== 'PUT') return json({ items: [summary], hasMorePages: false, nextCursor: null })
    if (url.endsWith('/api/trips/finished-1') && options.method === 'PUT') return json({ error: 'Trip changed' }, 409)
    if (url.endsWith('/api/trips/finished-1')) {
      detailGets++
      if (detailGets === 1) return json(makeDetails('Milk', 1))
      if (detailGets === 2) return Promise.reject(new TypeError('offline'))
      return refreshed.promise
    }
    throw new Error(`Unexpected request: ${url}`)
  })
  await openApp(calls)
  fireEvent.click(appNav('Trips'))
  fireEvent.click(await screen.findByRole('button', { name: 'View details' }))
  await screen.findByText('Milk')
  fireEvent.click(screen.getByRole('button', { name: 'Correct trip' }))
  fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Drafted item' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Review corrections' }).closest('form'))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm changes' }))
  await screen.findByText(/This trip changed since you opened it/)

  fireEvent.click(screen.getByRole('button', { name: 'Reload trip details' }))
  await screen.findByText(/Could not connect to the server/i)
  assert.ok(screen.getByRole('heading', { name: 'Save these trip changes?' }))
  assert.ok(screen.getByText('Drafted item'))
  assert.ok(screen.getByRole('button', { name: 'Reload trip details' }))

  fireEvent.click(screen.getByRole('button', { name: 'Reload trip details' }))
  await waitFor(() => assert.equal(detailGets, 3))
  refreshed.resolve(json(makeDetails('Fresh server item', 2)))
  await screen.findByText('Fresh server item')
  assert.equal(screen.queryByText('Drafted item'), null)
  assert.equal(screen.queryByRole('heading', { name: 'Save these trip changes?' }), null)
})

test('catalog edit is optimistic and rolls back to the prior value after a rejected save', async () => {
  const save = deferred()
  const custom = { id: 'custom-1', name: 'Local Oats', category: 'Pantry', source: 'custom' }
  const calls = mockFetch((url) => {
    if (url.endsWith('/api/auth/me')) return json({ user })
    if (url.endsWith('/api/cart')) return json(cart)
    if (url.endsWith('/api/catalog')) return json({ items: [...groceries, custom] })
    if (url.endsWith('/api/trips')) return json(emptyTrips)
    if (url.endsWith('/api/catalog/custom-1')) return save.promise
    throw new Error(`Unexpected request: ${url}`)
  })
  await openApp(calls)
  fireEvent.click(appNav('Catalog'))
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
  const name = screen.getByLabelText('Grocery name')
  fireEvent.change(name, { target: { value: 'Rolled Oats' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Save catalog item' }).closest('form'))
  await waitFor(() => assert.equal(screen.getByDisplayValue('Rolled Oats').value, 'Rolled Oats'))
  save.resolve(json({ error: 'write failed' }, 503))
  await screen.findByRole('alert')
  fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' }).at(-1))
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  assert.equal(screen.getByLabelText('Grocery name').value, 'Local Oats')
})

test('cart purchase toggle updates immediately and restores its old value after a rejected save', async () => {
  const save = deferred()
  const calls = mockFetch((url) => {
    if (url.endsWith('/api/auth/me')) return json({ user })
    if (url.endsWith('/api/cart')) return json(cart)
    if (url.endsWith('/api/catalog')) return json({ items: groceries })
    if (url.endsWith('/api/trips')) return json(emptyTrips)
    if (url.endsWith('/api/cart/items/cart-1')) return save.promise
    throw new Error(`Unexpected request: ${url}`)
  })
  await openApp(calls)
  const checkbox = await screen.findByRole('checkbox', { name: 'Mark Milk as purchased' })
  fireEvent.click(checkbox)
  await waitFor(() => assert.ok(screen.getByRole('checkbox', { name: 'Mark Milk as unpurchased' }).checked))
  save.resolve(json({ error: 'write failed' }, 503))
  await screen.findByRole('alert')
  assert.equal(screen.getByRole('checkbox', { name: 'Mark Milk as purchased' }).checked, false)
})

test('logout and signing back into the same account starts a fresh private cache', async () => {
  let authenticated = true
  const calls = mockFetch((url) => {
    if (url.endsWith('/api/auth/me')) return authenticated ? json({ user }) : json({ error: 'unauthenticated' }, 401)
    if (url.endsWith('/api/auth/logout')) { authenticated = false; return json({ message: 'signed out' }) }
    if (url.endsWith('/api/auth/login')) { authenticated = true; return json({ user }) }
    return appResponse(url)
  })
  await openApp(calls)
  fireEvent.click(appNav('Sign out'))
  await screen.findByRole('heading', { name: 'Sign in' })
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: user.email } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'local-password' } })
  fireEvent.submit(screen.getByLabelText('Email address').closest('form'))
  await screen.findByRole('heading', { name: 'My Lists' })
  await waitFor(() => assert.equal(calls.filter((call) => call.url === '/api/lists' && !call.options.method).length, 2))
  assert.equal(calls.filter((call) => call.url.endsWith('/api/catalog')).length, 2)
  assert.equal(calls.filter((call) => call.url.endsWith('/api/trips')).length, 2)
})

test('logout aborts an outstanding private collection request', async () => {
  const catalogResponse = deferred()
  let catalogSignal
  const calls = mockFetch((url, options) => {
    if (url.endsWith('/api/auth/me')) return json({ user })
    if (url.endsWith('/api/auth/logout')) return new Response(null, { status: 204 })
    if (url.endsWith('/api/cart')) return json(cart)
    if (url.endsWith('/api/catalog')) { catalogSignal = options.signal; return catalogResponse.promise }
    if (url.endsWith('/api/trips')) return json(emptyTrips)
    throw new Error(`Unexpected request: ${url}`)
  })
  await openApp(calls)
  await waitFor(() => assert.ok(catalogSignal))
  fireEvent.click(appNav('Sign out'))
  await waitFor(() => assert.equal(calls.some((call) => call.url.endsWith('/api/auth/logout')), true))
  await screen.findByRole('heading', { name: 'Sign in' })
  await waitFor(() => assert.equal(catalogSignal.aborted, true))
  catalogResponse.resolve(json({ items: groceries }))
  assert.equal(calls.filter((call) => call.url.endsWith('/api/catalog')).length, 1)
})

test('focus confirms the shared cookie identity before refreshing private cache data', async () => {
  const accountA = user
  const accountB = { ...user, id: 'shopper-2', email: 'other@example.test' }
  let activeAccount = accountA
  const calls = mockFetch((url) => {
    if (url.endsWith('/api/auth/me')) return json({ user: activeAccount })
    if (url.endsWith('/api/cart')) return json({ tripId: `list-${activeAccount.id}`, name: `List ${activeAccount.id}`, items: [], currency: 'PHP', revision: 1 })
    if (url.endsWith('/api/catalog')) return json({ items: groceries })
    if (url.endsWith('/api/trips')) return json(emptyTrips)
    throw new Error(`Unexpected request: ${url}`)
  })
  render(React.createElement(App))
  await screen.findByRole('heading', { name: 'My Lists' })
  await screen.findByRole('button', { name: /List shopper-1/ })
  const privateReads = () => calls.filter((call) => !call.url.includes('/api/auth/'))
  assert.ok(privateReads().length >= 3)
  assert.ok(privateReads().every((call) => call.options.headers['X-Expected-Account-Id'] === accountA.id))
  assert.equal(calls.find((call) => call.url.endsWith('/api/auth/me')).options.headers['X-Expected-Account-Id'], undefined)

  activeAccount = accountB
  window.dispatchEvent(new window.Event('focus'))
  await screen.findByRole('button', { name: /List shopper-2/ })
  assert.equal(screen.queryByRole('button', { name: /List shopper-1/ }), null)
  assert.ok(privateReads().some((call) => call.options.headers['X-Expected-Account-Id'] === accountB.id))
  assert.ok(calls.filter((call) => call.url.endsWith('/api/auth/me')).length >= 2)
})

test('cross-tab session signals adopt sign-in and quarantine sign-out without sharing identity data', async () => {
  const otherUser = { ...user, id: 'shopper-2', email: 'other@example.test' }
  let authenticated = false
  const calls = mockFetch((url) => {
    if (url.endsWith('/api/auth/me')) return authenticated ? json({ user: otherUser }) : json({ error: 'Authentication required' }, 401)
    if (url.endsWith('/api/cart')) return json({ tripId: 'list-b', name: 'List B', items: [], currency: 'PHP', revision: 1 })
    if (url.endsWith('/api/catalog')) return json({ items: groceries })
    if (url.endsWith('/api/trips')) return json(emptyTrips)
    throw new Error(`Unexpected request: ${url}`)
  })
  render(React.createElement(App))
  await screen.findByRole('heading', { name: 'Sign in' })

  authenticated = true
  fireEvent(window, new window.StorageEvent('storage', { key: 'cartcheck:session-change', newValue: 'signal-1' }))
  await screen.findByRole('button', { name: /List B/ })
  assert.ok(calls.filter((call) => !call.url.includes('/api/auth/')).every((call) => call.options.headers['X-Expected-Account-Id'] === otherUser.id))

  authenticated = false
  fireEvent(window, new window.StorageEvent('storage', { key: 'cartcheck:session-change', newValue: 'signal-2' }))
  await screen.findByRole('heading', { name: 'Sign in' })
  assert.equal(screen.queryByRole('button', { name: 'List B' }), null)
})

test('switching accounts releases the prior account settings busy state', async () => {
  const save = deferred()
  const accountB = { ...user, id: 'shopper-2', email: 'other@example.test', preferred_currency: 'PHP' }
  let activeAccount = user
  const calls = mockFetch((url) => {
    if (url.endsWith('/api/auth/me')) return json({ user: activeAccount })
    if (url.endsWith('/api/cart')) return json({ ...cart, tripId: `trip-${activeAccount.id}`, name: activeAccount.id === user.id ? 'Groceries' : 'List shopper-2' })
    if (url.endsWith('/api/catalog')) return json({ items: groceries })
    if (url.endsWith('/api/trips')) return json(emptyTrips)
    if (url.endsWith('/api/me/settings')) return save.promise
    throw new Error(`Unexpected request: ${url}`)
  })
  await openApp(calls)
  fireEvent.click(appNav('Settings'))
  await screen.findByRole('heading', { name: 'Settings' })
  fireEvent.change(screen.getByLabelText('Preferred currency for new lists'), { target: { value: 'USD' } })
  fireEvent.submit(screen.getByLabelText('Preferred currency for new lists').closest('form'))
  await waitFor(() => assert.equal(calls.some((call) => call.url.endsWith('/api/me/settings')), true))

  activeAccount = accountB
  fireEvent(window, new window.StorageEvent('storage', { key: 'cartcheck:session-change', newValue: 'settings-switch' }))
  await screen.findByRole('button', { name: /List shopper-2/ })
  fireEvent.click(appNav('Settings'))
  await screen.findByRole('heading', { name: 'Settings' })
  assert.equal(screen.getByLabelText('Preferred currency for new lists').disabled, false)

  save.resolve(json({ preferredCurrency: 'USD' }))
  await waitFor(() => assert.equal(screen.getByLabelText('Preferred currency for new lists').value, 'PHP'))
})

test('same-account quarantine clears pending settings state and retries after a transient check failure', async () => {
  const save = deferred()
  let sessionReads = 0
  const calls = mockFetch((url, options) => {
    if (url.endsWith('/api/auth/me')) {
      sessionReads++
      if (sessionReads === 2) return Promise.reject(new TypeError('offline'))
      return json({ user })
    }
    if (url.endsWith('/api/me/settings')) return save.promise
    return appResponse(url, options)
  })
  await openApp(calls)
  fireEvent.click(appNav('Settings'))
  await screen.findByRole('heading', { name: 'Settings' })
  fireEvent.change(screen.getByLabelText('Preferred currency for new lists'), { target: { value: 'USD' } })
  fireEvent.submit(screen.getByLabelText('Preferred currency for new lists').closest('form'))
  await waitFor(() => assert.equal(calls.some((call) => call.url.endsWith('/api/me/settings')), true))

  fireEvent(window, new window.StorageEvent('storage', { key: 'cartcheck:session-change', newValue: 'same-account-pending' }))
  await screen.findByRole('heading', { name: 'Could not connect' })
  assert.equal(screen.queryByRole('navigation', { name: 'Main navigation' }), null)
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await screen.findByRole('heading', { name: 'My Lists' })
  fireEvent.click(appNav('Settings'))
  await screen.findByRole('heading', { name: 'Settings' })
  assert.equal(screen.getByLabelText('Preferred currency for new lists').disabled, false)
  assert.equal(screen.getByLabelText('Preferred currency for new lists').value, 'PHP')

  save.resolve(json({ preferredCurrency: 'USD' }))
  await waitFor(() => assert.equal(screen.getByLabelText('Preferred currency for new lists').value, 'PHP'))
})

test('a revoked cookie on focus clears the private screen and cache', async () => {
  let authenticated = true
  const calls = mockFetch((url) => {
    if (url.endsWith('/api/auth/me')) return authenticated ? json({ user }) : json({ error: 'Authentication required' }, 401)
    if (url.endsWith('/api/cart')) return json({ tripId: 'list-a', name: 'Private A list', items: [], currency: 'PHP', revision: 1 })
    if (url.endsWith('/api/catalog')) return json({ items: groceries })
    if (url.endsWith('/api/trips')) return json(emptyTrips)
    throw new Error(`Unexpected request: ${url}`)
  })
  render(React.createElement(App))
  await screen.findByRole('button', { name: /Private A list/ })
  authenticated = false
  window.dispatchEvent(new window.Event('focus'))
  await screen.findByRole('heading', { name: 'Sign in' })
  assert.equal(screen.queryByRole('button', { name: /Private A list/ }), null)
  assert.equal(calls.filter((call) => !call.url.includes('/api/auth/')).length, 3)
})

test('a private 401 quarantines cached data even when session confirmation is offline', async () => {
  let sessionReads = 0
  let listReads = 0
  const calls = mockFetch((url) => {
    if (url.endsWith('/api/auth/me')) {
      sessionReads++
      return sessionReads === 1 ? json({ user }) : Promise.reject(new TypeError('offline'))
    }
    if (url.endsWith('/api/cart')) {
      listReads++
      return listReads === 1
        ? json({ tripId: 'list-a', name: 'Quarantined A list', items: [], currency: 'PHP', revision: 1 })
        : json({ error: 'Authentication required' }, 401)
    }
    if (url.endsWith('/api/catalog')) return json({ items: groceries })
    if (url.endsWith('/api/trips')) return json(emptyTrips)
    throw new Error(`Unexpected request: ${url}`)
  })
  render(React.createElement(App))
  await screen.findByRole('button', { name: /Quarantined A list/ })

  await act(async () => assert.rejects(getLists(), (error) => error.status === 401))
  await screen.findByRole('heading', { name: 'Could not connect' })
  assert.equal(screen.queryByRole('button', { name: /Quarantined A list/ }), null)
  assert.equal(sessionReads, 2)
  assert.equal(listReads, 2)
})

test('a transient focus check preserves the last confirmed account data', async () => {
  let sessionReads = 0
  const calls = mockFetch((url) => {
    if (url.endsWith('/api/auth/me')) {
      sessionReads++
      return sessionReads === 1 ? json({ user }) : Promise.reject(new TypeError('offline'))
    }
    if (url.endsWith('/api/cart')) return json({ tripId: 'list-a', name: 'Known A list', items: [], currency: 'PHP', revision: 1 })
    if (url.endsWith('/api/catalog')) return json({ items: groceries })
    if (url.endsWith('/api/trips')) return json(emptyTrips)
    throw new Error(`Unexpected request: ${url}`)
  })
  render(React.createElement(App))
  await screen.findByRole('button', { name: /Known A list/ })
  const privateRequestCount = calls.filter((call) => !call.url.includes('/api/auth/')).length

  window.dispatchEvent(new window.Event('focus'))
  await waitFor(() => assert.equal(sessionReads, 2))
  assert.ok(screen.getByRole('button', { name: /Known A list/ }))
  assert.equal(calls.filter((call) => !call.url.includes('/api/auth/')).length, privateRequestCount)
})
