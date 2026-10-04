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
const { render, screen, fireEvent, cleanup, waitFor } = await import('@testing-library/react')
const { createServer } = await import('vite')
const vite = await createServer({ configFile: 'vite.config.js', server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const { DataCacheProvider } = await vite.ssrLoadModule('/src/dataCache.jsx')
const { createDataCache } = await vite.ssrLoadModule('/src/dataCache.js')
const { default: ShoppingList } = await vite.ssrLoadModule('/src/ShoppingList.jsx')
test.after(async () => { cleanup(); await vite.close(); dom.window.close(); globalThis.fetch = undefined })

test('Finish refreshes the server revision, freezes review, and reconciles confirmed active/history caches', async () => {
  const item = { id: 'item', name: 'Milk', category: 'Dairy', quantity: '1', bought: true, estimatedTotal: null, actualTotal: null }
  const cart = { tripId: 'active', revision: 1, currency: 'PHP', budget: null, items: [item] }
  const fresh = { ...cart, revision: 42 }
  const next = { ...cart, tripId: 'next', revision: 1, items: [] }
  const completed = { id: 'active', revision: 42, currency: 'PHP', completedAt: '2026-10-04T00:00:00Z', items: [item], summary: {} }
  const cache = createDataCache()
  cache.set('cart', cart)
  const calls = []
  const json = (body) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    if (url === '/api/cart') return json(fresh)
    if (url === '/api/catalog') return json({ items: [] })
    if (url === '/api/trips') return json({ items: [], nextCursor: null })
    if (url === '/api/trips/active/finish') return json({ activeTrip: next, completedTrip: completed })
    throw new Error(`Unexpected request ${url}`)
  }
  render(React.createElement(DataCacheProvider, { cache }, React.createElement(ShoppingList, { onEditHandled: () => {}, onBrowseCatalog: () => {}, onMutationPending: () => {}, onReviewChange: () => {} })))
  fireEvent.click(screen.getByRole('button', { name: 'Finish shopping' }))
  await screen.findByRole('heading', { name: 'Finish shopping?' })
  assert.equal(calls.filter(({ url }) => url === '/api/cart').length, 1)
  let replaced = false
  await cache.load('cart', () => { replaced = true; return Promise.resolve(next) }, { force: true })
  assert.equal(replaced, false, 'review blocks even a forced background replacement')
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and finish' }))
  await waitFor(() => assert.equal(cache.get('cart').data.tripId, 'next'))
  assert.deepEqual(JSON.parse(calls.find(({ url }) => url.endsWith('/finish')).options.body), { revision: 42 })
  assert.equal(cache.get('trip:active').data.trip.id, 'active')
  assert.equal(cache.get('trips').data.items[0].id, 'active')
})
