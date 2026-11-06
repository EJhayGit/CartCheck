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
const { default: Trips } = await vite.ssrLoadModule('/src/Trips.jsx')
test.afterEach(() => cleanup())
test.after(async () => { await vite.close(); dom.window.close(); globalThis.fetch = undefined })

const summary = { estimatedTotal: null, estimatedMissingCount: 0, actualTotal: null, actualMissingCount: 0 }
const trip = (id, name) => ({ id, name, completedAt: '2026-11-01T00:00:00Z', currency: 'PHP', budget: null, itemCount: 1, boughtCount: 1, notBoughtCount: 0, summary })
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function setup({ remove = () => new Response(null, { status: 204 }) } = {}) {
  const cache = createDataCache()
  const history = { items: [trip('a', 'Weekly Groceries'), trip('b', 'Party Supplies')], nextCursor: null }
  cache.set('trips', history)
  const deletes = []
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'DELETE') { deletes.push(url); return remove() }
    if (url === '/api/trips') return json(history)
    throw new Error(`Unexpected request ${url}`)
  }
  render(React.createElement(DataCacheProvider, { cache }, React.createElement(Trips, { onReviewChange: () => {} })))
  const ids = () => cache.get('trips').data.items.map((item) => item.id)
  return { deletes, ids }
}

test('Delete asks first, then removes the trip', async () => {
  const { deletes, ids } = setup()
  fireEvent.click(screen.getByRole('button', { name: 'Delete Weekly Groceries' }))
  const group = screen.getByRole('group', { name: 'Delete Weekly Groceries?' })
  assert.match(group.textContent, /Delete “Weekly Groceries” from history\? This can’t be undone\./)
  assert.equal(deletes.length, 0)
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  assert.equal(screen.queryByRole('heading', { name: 'Weekly Groceries' }), null)
  await screen.findByText('Weekly Groceries deleted.')
  assert.deepEqual(deletes, ['/api/trips/a'])
  assert.deepEqual(ids(), ['b'])
})

test('Keep closes the confirmation', () => {
  const { deletes } = setup()
  fireEvent.click(screen.getByRole('button', { name: 'Delete Weekly Groceries' }))
  fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
  assert.equal(screen.queryByRole('group', { name: 'Delete Weekly Groceries?' }), null)
  assert.ok(screen.getByRole('heading', { name: 'Weekly Groceries' }))
  assert.equal(deletes.length, 0)
})

test('A failed delete restores the card in place', async () => {
  const { ids } = setup({ remove: () => json({ error: 'Server error' }, 500) })
  fireEvent.click(screen.getByRole('button', { name: 'Delete Weekly Groceries' }))
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  await screen.findByText('Server error')
  await waitFor(() => assert.deepEqual(ids(), ['a', 'b']))
  assert.equal(screen.getAllByRole('heading', { level: 2 })[0].textContent, 'Weekly Groceries')
})

test('Delete is sent once', async () => {
  let finish
  const { deletes } = setup({ remove: () => new Promise((resolve) => { finish = () => resolve(new Response(null, { status: 204 })) }) })
  fireEvent.click(screen.getByRole('button', { name: 'Delete Weekly Groceries' }))
  const confirm = screen.getByRole('button', { name: 'Delete' })
  fireEvent.click(confirm)
  fireEvent.click(confirm)
  await waitFor(() => assert.equal(deletes.length, 1))
  finish()
  await screen.findByText('Weekly Groceries deleted.')
  assert.equal(deletes.length, 1)
})
