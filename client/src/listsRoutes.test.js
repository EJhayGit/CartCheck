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
const { cleanup, render, screen } = await import('@testing-library/react')
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
  assert.match(card.textContent, /2 of 4 items purchased/)
  assert.match(card.textContent, /No prices entered/)
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
