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
const { act, cleanup, fireEvent, render, screen, waitFor, within } = await import('@testing-library/react')
const { createServer } = await import('vite')
const vite = await createServer({ configFile: 'vite.config.js', server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const { default: Catalog } = await vite.ssrLoadModule('/src/Catalog.jsx')
const { DataCacheProvider } = await vite.ssrLoadModule('/src/dataCache.jsx')
const { createDataCache, listSummary } = await vite.ssrLoadModule('/src/dataCache.js')

test.afterEach(() => { cleanup(); globalThis.fetch = undefined })
test.after(async () => { await vite.close(); dom.window.close() })

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const summary = (id, name = `List ${id}`) => ({ tripId: String(id), name, currency: 'PHP', summary: {} })
const noop = () => {}
function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('Catalog exposes every list through explicit pagination', async () => {
  const first = Array.from({ length: 50 }, (_, index) => summary(index + 1))
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    if (String(url) === '/api/lists') return json({ items: first, nextCursor: 'page-2' })
    if (String(url) === '/api/lists?cursor=page-2') return json({ items: [summary(51, 'List 51')], nextCursor: null })
    if (String(url) === '/api/catalog') return json({ items: [] })
    throw new Error(`Unexpected request: ${url}`)
  }

  render(React.createElement(DataCacheProvider, null, React.createElement(Catalog, { onAdd: async () => ({}), onAddPending: noop })))
  const destination = await screen.findByLabelText('Add items to')
  await waitFor(() => assert.equal(within(destination).getAllByRole('option').length, 51))
  assert.equal(within(destination).queryByRole('option', { name: 'List 51' }), null)
  fireEvent.click(screen.getByRole('button', { name: 'Load more lists' }))
  await waitFor(() => assert.ok(within(destination).getByRole('option', { name: 'List 51' })))
  assert.ok(calls.includes('/api/lists?cursor=page-2'))
  assert.equal(screen.queryByRole('button', { name: 'Load more lists' }), null)
})

test('Catalog ignores a delayed list page when the active cursor changes', async () => {
  const pending = deferred()
  let pageCalls = 0
  globalThis.fetch = async (url) => {
    if (String(url) === '/api/catalog') return json({ items: [] })
    if (String(url) === '/api/lists?cursor=stale') { pageCalls += 1; return pending.promise }
    throw new Error(`Unexpected request: ${url}`)
  }
  const cache = createDataCache()
  cache.set('lists', { items: [listSummary(summary('first'))], nextCursor: 'stale' })
  render(React.createElement(DataCacheProvider, { cache }, React.createElement(Catalog, { onAdd: async () => ({}), onAddPending: noop })))
  const destination = await screen.findByLabelText('Add items to')
  fireEvent.click(screen.getByRole('button', { name: 'Load more lists' }))
  await waitFor(() => assert.equal(pageCalls, 1))
  await act(async () => { cache.set('lists', { items: [listSummary(summary('fresh'))], nextCursor: 'fresh-cursor' }) })
  await act(async () => { pending.resolve(json({ items: [summary('stale-result')], nextCursor: null })) })
  await waitFor(() => assert.ok(within(destination).getByRole('option', { name: 'List fresh' })))
  assert.equal(within(destination).queryByRole('option', { name: 'List stale-result' }), null)
  assert.equal(cache.get('lists').data.nextCursor, 'fresh-cursor')
})

function renderInstantAdd(onAdd, onAddPending = noop) {
  globalThis.fetch = async (url) => {
    if (String(url) === '/api/lists') return json({ items: [summary(1, 'Groceries')], nextCursor: null })
    if (String(url) === '/api/catalog') return json({ items: [{ id: 'p-1', name: 'Eggs', category: 'Other', source: 'custom' }, { id: 'p-2', name: 'Milk', category: 'Other', source: 'custom' }] })
    if (String(url) === '/api/lists/1') return json({ tripId: '1', name: 'Groceries', currency: 'PHP', items: [] })
    throw new Error(`Unexpected request: ${url}`)
  }
  render(React.createElement(DataCacheProvider, null, React.createElement(Catalog, { destinationId: '1', onAdd, onAddPending, onOpenList: noop })))
}

test('Catalog adds show at once and save one at a time until the queue is empty', async () => {
  const saves = []
  const started = []
  const pending = []
  renderInstantAdd((id) => { started.push(id); const save = deferred(); saves.push(save); return save.promise }, (value) => pending.push(value))
  fireEvent.click(await screen.findByRole('button', { name: 'Add Eggs' }))
  assert.equal(screen.getByRole('button', { name: 'Change amount of Eggs' }).disabled, true)
  assert.match(screen.getByRole('status').textContent, /1 added/)
  fireEvent.click(screen.getByRole('button', { name: 'Add Milk' }))
  assert.match(screen.getByRole('status').textContent, /2 added/)
  assert.equal(screen.getByRole('button', { name: 'Saving…' }).disabled, true)
  await waitFor(() => assert.deepEqual(started, ['p-1']))
  await act(async () => saves[0].resolve({ created: true }))
  await waitFor(() => assert.deepEqual(started, ['p-1', 'p-2']))
  assert.equal(pending.at(-1), true)
  await act(async () => saves[1].resolve({ created: true }))
  await waitFor(() => assert.equal(pending.at(-1), false))
  assert.ok(screen.getByRole('button', { name: 'Back to list' }))
})

test('a failed Catalog add undoes the label and count, names the item and keeps later adds', async () => {
  const started = []
  renderInstantAdd(async (id) => { started.push(id); if (id === 'p-1') throw new Error('Offline'); return { created: true } })
  fireEvent.click(await screen.findByRole('button', { name: 'Add Eggs' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add Milk' }))
  assert.match((await screen.findByRole('alert')).textContent, /We could not add Eggs.*Offline/)
  await waitFor(() => assert.deepEqual(started, ['p-1', 'p-2']))
  await screen.findByRole('button', { name: 'Add Eggs' })
  assert.match(screen.getByRole('status').textContent, /1 added/)
})
