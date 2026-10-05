import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { poolConfig } from './db/config.js'
import { assertUnusedTestEmails, cleanupTestEmails, testEmails } from './testDatabaseSafety.js'

const runId = process.env.CARTCHECK_TEST_RUN_ID
const databaseUrl = runId && process.env.CARTCHECK_TEST_DATABASE_URL

test('named lists, item snapshots, transactional completion, history and ownership', {
  skip: !databaseUrl && 'Use an explicitly isolated database runner for API tests',
}, async (t) => {
  const db = new pg.Client(poolConfig({ ...process.env, DATABASE_URL: databaseUrl }))
  await db.connect()
  const emails = testEmails(runId).slice(4, 6)
  await assertUnusedTestEmails(db, emails)
  const socket = createServer()
  socket.listen(0, '127.0.0.1')
  await once(socket, 'listening')
  const port = socket.address().port
  await new Promise((resolve) => socket.close(resolve))
  const base = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('.', import.meta.url),
    env: { ...process.env, DATABASE_URL: databaseUrl, PORT: String(port), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  child.stdout.on('data', (v) => { logs += v })
  child.stderr.on('data', (v) => { logs += v })
  t.after(async () => {
    child.kill()
    if (child.exitCode === null) await once(child, 'exit')
    try { await cleanupTestEmails(db, emails) } finally { await db.end() }
  })
  async function call(path, { cookie, method = 'GET', body } = {}) {
    return fetch(base + path, { method, headers: {
      Origin: 'http://localhost:5173', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  }
  const deadline = Date.now() + 15000
  while (true) {
    try { if ((await call('/readyz')).ok) break } catch {}
    assert.ok(Date.now() < deadline, `API did not become ready: ${logs}`)
    await new Promise((r) => setTimeout(r, 100))
  }
  const cookies = []
  for (const email of emails) {
    const result = await call('/api/auth/register', { method: 'POST', body: { email, password: `Lists-${randomUUID()}!` } })
    assert.equal(result.status, 201)
    cookies.push(result.headers.get('set-cookie').split(';')[0])
  }
  const [a, b] = cookies
  const create = async (cookie, body) => {
    const response = await call('/api/lists', { cookie, method: 'POST', body })
    assert.equal(response.status, 201, await response.clone().text())
    return response.json()
  }
  const load = async (id, cookie = a) => (await call(`/api/lists/${id}`, { cookie })).json()
  const patch = (id, body, cookie = a) => call(`/api/lists/${id}`, { cookie, method: 'PATCH', body })
  const add = async (id, productId, cookie = a) => {
    const response = await call(`/api/lists/${id}/items`, { cookie, method: 'POST', body: { productId } })
    assert.ok([200, 201].includes(response.status), await response.clone().text())
    return response.json()
  }
  const edit = (id, itemId, body, cookie = a) => call(`/api/lists/${id}/items/${itemId}`, { cookie, method: 'PATCH', body })
  const remove = (id, itemId, cookie = a) => call(`/api/lists/${id}/items/${itemId}`, { cookie, method: 'DELETE' })

  await t.test('reads and registration create no hidden list; singleton routes retire without writes', async () => {
    assert.deepEqual((await (await call('/api/lists', { cookie: a })).json()).items, [])
    assert.deepEqual((await (await call('/api/lists', { cookie: b })).json()).items, [])
    for (const [path, method] of [['/api/cart', 'GET'], ['/api/cart', 'PATCH'], ['/api/cart/items', 'POST'], ['/api/cart/items/1', 'PATCH'], ['/api/cart/items/1', 'DELETE']]) {
      assert.equal((await call(path, { cookie: a, method, ...(method === 'GET' ? {} : { body: {} }) })).status, 410)
    }
    assert.equal((await call('/api/lists')).status, 401)
    assert.equal((await call('/api/lists', { method: 'POST', body: { name: 'X' } })).status, 401)
    assert.deepEqual((await (await call('/api/lists', { cookie: a })).json()).items, [])
  })
  await t.test('validation accepts Unicode duplicates and optional null/zero budget', async () => {
    for (const body of [{}, { name: '' }, { name: '\u00a0\u2003\ufeff' }, { name: '😀'.repeat(101) }, { name: 'X', budget: '-1' }, { name: 'X', currency: 'GBP' }, { name: 'X', extra: true }]) {
      assert.equal((await call('/api/lists', { cookie: a, method: 'POST', body })).status, 400)
    }
    const unicode = await create(a, { name: '  🛒'.padEnd(2) + '😀'.repeat(99) + '  ', budget: '0.00' })
    assert.equal([...unicode.name].length, 100)
    assert.equal(unicode.budget, '0.00')
    assert.equal((await call(`/api/lists/${unicode.tripId}`, { cookie: a, method: 'DELETE' })).status, 204)
  })
  const first = await create(a, { name: '  Weekly Groceries  ', budget: '250.50' })
  const second = await create(a, { name: 'Weekly Groceries' })
  const foreign = await create(b, { name: 'Private list', budget: '75' })
  assert.equal(first.name, 'Weekly Groceries')
  assert.equal(second.budget, null)
  assert.notEqual(first.tripId, second.tripId)
  assert.equal(first.currency, 'PHP')
  assert.ok(first.createdAt && first.updatedAt)
  const catalog = (await (await call('/api/catalog', { cookie: a })).json()).items
  const apples = catalog.find((p) => p.name === 'Apples')
  const customResponse = await call('/api/catalog', { cookie: a, method: 'POST', body: { name: 'Private flour', category: 'Other' } })
  const custom = (await customResponse.json()).item
  const item = (await add(first.tripId, apples.id)).item
  const unchecked = (await add(first.tripId, custom.id)).item
  const otherItem = (await add(second.tripId, apples.id)).item
  const bProduct = (await (await call('/api/catalog', { cookie: b })).json()).items.find((p) => p.name === 'Apples')
  const bItem = (await add(foreign.tripId, bProduct.id, b)).item

  await t.test('multiple lists, pagination, currency snapshot and duplicate catalog additions are independent', async () => {
    const summaries = await (await call('/api/lists', { cookie: a })).json()
    assert.equal(summaries.items.length, 2)
    assert.ok(summaries.items.every((v) => v.tripId !== foreign.tripId))
    const owners = await db.query('SELECT id FROM cartcheck.users WHERE email=$1', [emails[0]])
    await db.query("UPDATE cartcheck.shopping_trips SET updated_at='2026-10-01T12:00:00.123900Z' WHERE id=$1 AND user_id=$2", [first.tripId, owners.rows[0].id])
    await db.query("UPDATE cartcheck.shopping_trips SET updated_at='2026-10-01T12:00:00.123800Z' WHERE id=$1 AND user_id=$2", [second.tripId, owners.rows[0].id])
    const page = await (await call('/api/lists?limit=1', { cookie: a })).json()
    assert.equal(page.items.length, 1)
    assert.ok(page.nextCursor)
    const tail = await (await call('/api/lists?limit=1&cursor=' + encodeURIComponent(page.nextCursor), { cookie: a })).json()
    assert.notEqual(tail.items[0].tripId, page.items[0].tripId)
    assert.equal(tail.items[0].tripId, second.tripId, 'microsecond cursor must not skip the next row within the same millisecond')
    assert.equal((await call('/api/lists?cursor=invalid', { cookie: a })).status, 400)
    const duplicate = await add(first.tripId, apples.id)
    assert.equal(duplicate.created, false)
    assert.equal(duplicate.item.id, item.id)
    const concurrent = await Promise.all([add(first.tripId, apples.id), add(first.tripId, apples.id)])
    assert.ok(concurrent.every((v) => v.item.id === item.id))
    await call('/api/me/settings', { cookie: a, method: 'PATCH', body: { preferredCurrency: 'USD' } })
    assert.equal((await load(first.tripId)).currency, 'PHP')
    const usd = await create(a, { name: 'New USD list' })
    assert.equal(usd.currency, 'USD')
    const eur = await create(a, { name: 'Explicit EUR', currency: 'EUR', budget: null })
    assert.equal(eur.currency, 'EUR')
    for (const list of [usd, eur]) await call(`/api/lists/${list.tripId}`, { cookie: a, method: 'DELETE' })
  })
  await t.test('every parent/item operation enforces account ownership and selected list membership', async () => {
    for (const method of ['GET', 'PATCH', 'DELETE']) {
      assert.equal((await call(`/api/lists/${foreign.tripId}`, { cookie: a, method, ...(method === 'PATCH' ? { body: { name: 'Stolen' } } : {}) })).status, 404)
    }
    assert.equal((await patch(foreign.tripId, { budget: '1' })).status, 404)
    assert.equal((await call(`/api/lists/${foreign.tripId}/items`, { cookie: a, method: 'POST', body: { productId: apples.id } })).status, 404)
    assert.equal((await call(`/api/lists/${first.tripId}/items`, { cookie: b, method: 'POST', body: { productId: custom.id } })).status, 404)
    assert.equal((await edit(first.tripId, bItem.id, { bought: true })).status, 404)
    assert.equal((await edit(second.tripId, item.id, { bought: true })).status, 404)
    assert.equal((await remove(second.tripId, item.id)).status, 404)
    assert.equal((await edit(first.tripId, item.id, { quantity: 9 }, b)).status, 404)
    assert.equal((await remove(first.tripId, item.id, b)).status, 404)
    assert.equal((await load(foreign.tripId, b)).budget, '75.00')
    assert.equal((await load(second.tripId)).items[0].bought, false)
    for (const id of ['bad-id', '0', '1e4']) {
      assert.equal((await call(`/api/lists/${id}`, { cookie: a })).status, 400)
      assert.equal((await patch(id, { name: 'X' })).status, 400)
      assert.equal((await call(`/api/lists/${id}`, { cookie: a, method: 'DELETE' })).status, 400)
    }
  })
  await t.test('rename, budget and item edits retain snapshots, exact amounts and update revision', async () => {
    const renamed = await (await patch(first.tripId, { name: '  Family 🛒  ', budget: '0' })).json()
    assert.equal(renamed.name, 'Family 🛒')
    assert.equal(renamed.budget, '0.00')
    assert.ok(renamed.revision > first.revision)
    assert.ok(new Date(renamed.updatedAt) >= new Date(first.updatedAt))
    assert.equal((await (await patch(first.tripId, { budget: null })).json()).budget, null)
    await patch(first.tripId, { budget: '250.50' })
    assert.equal((await edit(first.tripId, item.id, { bought: true, actualTotal: '0.00', estimatedTotal: '10.01' })).status, 200)
    assert.equal((await edit(first.tripId, unchecked.id, { name: 'Snapshot flour', quantity: '2.500', unitLabel: 'kg', estimatedTotal: '2.50', actualTotal: '99.00' })).status, 200)
    await call(`/api/catalog/${custom.id}`, { cookie: a, method: 'PATCH', body: { name: 'Renamed catalog flour' } })
    const fresh = await load(first.tripId)
    assert.equal(fresh.items[1].name, 'Snapshot flour')
    assert.equal(fresh.items[1].quantity, '2.500')
    assert.equal(fresh.summary.estimatedTotal, '12.51')
    assert.equal(fresh.summary.actualTotal, '0.00', 'unchecked actual prices do not count')
    for (const changes of [{ quantity: 0 }, { unitLabel: 4 }, { category: 'Other' }, { bought: 'true' }, { actualTotal: '-0.01' }, { actualTotal: '0.001' }, { actualTotal: '1e4' }]) {
      assert.equal((await edit(first.tripId, item.id, changes)).status, 400)
    }
    const removed = await remove(second.tripId, otherItem.id)
    assert.equal(removed.status, 200)
    assert.equal((await removed.json()).list.items.length, 0)
    assert.equal((await load(first.tripId)).items.length, 2)
  })
  let completed
  await t.test('completion is revision guarded, transactional, idempotent and creates no replacement', async () => {
    const review = await load(first.tripId)
    const finish = (cookie, revision) => call(`/api/trips/${first.tripId}/finish`, { cookie, method: 'POST', body: { revision } })
    assert.equal((await finish(b, review.revision)).status, 404)
    assert.equal((await finish(a, 1)).status, 409)
    const results = await Promise.all([finish(a, review.revision), finish(a, review.revision)])
    assert.ok(results.every((r) => r.status === 200))
    const bodies = await Promise.all(results.map((r) => r.json()))
    completed = bodies[0].completedTrip
    assert.equal(bodies[1].completedTrip.id, completed.id)
    assert.equal(Object.hasOwn(bodies[0], 'activeTrip'), false)
    assert.equal(completed.name, 'Family 🛒')
    assert.equal(completed.currency, 'PHP')
    assert.equal(completed.items[0].bought, true)
    assert.equal(completed.items[1].bought, false)
    assert.ok(completed.items.every((v) => v.productId === null))
    assert.equal(completed.items[0].actualTotal, '0.00')
    const active = (await (await call('/api/lists', { cookie: a })).json()).items
    assert.deepEqual(active.map((v) => v.tripId), [second.tripId])
    assert.equal((await load(second.tripId)).items.length, 0)
    assert.equal((await finish(a, review.revision)).status, 200)
    assert.equal((await (await call('/api/lists', { cookie: a })).json()).items.length, 1)
    assert.equal((await (await call(`/api/lists/${first.tripId}`, { cookie: a })).json()).completedTrip.id, completed.id)
    assert.equal((await call(`/api/lists/${first.tripId}`, { cookie: b })).status, 404)
    for (const operation of [
      patch(first.tripId, { name: 'Cannot rename' }),
      patch(first.tripId, { budget: '9' }),
      edit(first.tripId, item.id, { bought: false }),
      remove(first.tripId, item.id),
      call(`/api/lists/${first.tripId}`, { cookie: a, method: 'DELETE' }),
      call(`/api/lists/${first.tripId}/items`, { cookie: a, method: 'POST', body: { productId: apples.id } }),
    ]) assert.equal((await operation).status, 404)
    const emptyReview = await load(second.tripId)
    assert.equal((await call(`/api/trips/${second.tripId}/finish`, { cookie: a, method: 'POST', body: { revision: emptyReview.revision } })).status, 400)
  })
  await t.test('history names and corrections preserve dates/currency after catalog deletion', async () => {
    const history = await (await call('/api/trips', { cookie: a })).json()
    assert.equal(history.items[0].name, completed.name)
    assert.equal(history.items[0].boughtCount, 1)
    assert.equal(history.items[0].notBoughtCount, 1)
    assert.equal((await call(`/api/trips/${completed.id}`, { cookie: b })).status, 404)
    const correct = (cookie, revision, items) => call(`/api/trips/${completed.id}`, { cookie, method: 'PUT', body: { revision, items } })
    assert.equal((await correct(b, completed.revision, [])).status, 404)
    const response = await correct(a, completed.revision, [...completed.items, {
      name: 'From memory', category: 'Pantry', quantity: '0.500', unitLabel: 'kg', estimatedTotal: null, actualTotal: null, bought: false,
    }])
    assert.equal(response.status, 200, await response.clone().text())
    const corrected = (await response.json()).trip
    assert.equal(corrected.items.length, 3)
    assert.equal(corrected.completedAt, completed.completedAt)
    assert.equal(corrected.currency, completed.currency)
    assert.equal((await correct(a, completed.revision, completed.items)).status, 409)
    assert.equal((await call(`/api/catalog/${custom.id}`, { cookie: a, method: 'DELETE' })).status, 204)
    const persisted = (await (await call(`/api/trips/${completed.id}`, { cookie: a })).json()).trip
    assert.equal(persisted.items[1].name, 'Snapshot flour')
    assert.equal(persisted.items[1].productId, null)
    assert.equal((await correct(a, corrected.revision, corrected.items.slice(1))).status, 200)
  })
  await t.test('confirmed active deletion removes only selected list and leaves history/other accounts', async () => {
    await add(second.tripId, apples.id)
    assert.equal((await call(`/api/lists/${second.tripId}`, { cookie: a, method: 'DELETE' })).status, 204)
    assert.deepEqual((await (await call('/api/lists', { cookie: a })).json()).items, [])
    assert.equal((await (await call('/api/trips', { cookie: a })).json()).items.length, 1)
    assert.equal((await load(foreign.tripId, b)).items.length, 1)
    assert.equal((await call(`/api/lists/${second.tripId}`, { cookie: a })).status, 404)
  })
  await t.test('concurrent edit/finish and delete/finish serialize on the selected parent', async () => {
    const list = await create(a, { name: 'Edit race' })
    const entry = (await add(list.tripId, apples.id)).item
    const review = await load(list.tripId)
    const [finished, edited] = await Promise.all([
      call(`/api/trips/${list.tripId}/finish`, { cookie: a, method: 'POST', body: { revision: review.revision } }),
      edit(list.tripId, entry.id, { bought: true }),
    ])
    assert.ok((finished.status === 200 && edited.status === 404) || (finished.status === 409 && edited.status === 200))
    if (finished.status === 409) {
      const fresh = await load(list.tripId)
      assert.equal((await call(`/api/trips/${list.tripId}/finish`, { cookie: a, method: 'POST', body: { revision: fresh.revision } })).status, 200)
    }
    assert.equal((await call(`/api/lists/${list.tripId}`, { cookie: a, method: 'DELETE' })).status, 404)
    const deleting = await create(a, { name: 'Delete race' })
    await add(deleting.tripId, apples.id)
    const fresh = await load(deleting.tripId)
    const [finishResponse, deleteResponse] = await Promise.all([
      call(`/api/trips/${deleting.tripId}/finish`, { cookie: a, method: 'POST', body: { revision: fresh.revision } }),
      call(`/api/lists/${deleting.tripId}`, { cookie: a, method: 'DELETE' }),
    ])
    assert.ok((finishResponse.status === 200 && deleteResponse.status === 404) || (finishResponse.status === 404 && deleteResponse.status === 204))
    assert.deepEqual((await (await call('/api/lists', { cookie: a })).json()).items, [])
    if (deleteResponse.status === 204) assert.equal((await db.query('SELECT count(*)::int AS count FROM cartcheck.trip_items WHERE trip_id=$1', [deleting.tripId])).rows[0].count, 0)
    const itemRace = await create(a, { name: 'Item delete race' })
    const itemEntry = (await add(itemRace.tripId, apples.id)).item
    const [deleteItem, updateItem] = await Promise.all([
      remove(itemRace.tripId, itemEntry.id), edit(itemRace.tripId, itemEntry.id, { bought: true }),
    ])
    assert.equal(deleteItem.status, 200)
    assert.ok([200, 404].includes(updateItem.status), 'racing item deletion must never cause an API 500')
    assert.equal((await load(itemRace.tripId)).items.length, 0)
    await call(`/api/lists/${itemRace.tripId}`, { cookie: a, method: 'DELETE' })
    const completedRows = await db.query("SELECT id FROM cartcheck.shopping_trips WHERE user_id=(SELECT id FROM cartcheck.users WHERE email=$1) AND status='completed' ORDER BY id LIMIT 2", [emails[0]])
    await db.query("UPDATE cartcheck.shopping_trips SET completed_at='2026-10-01T12:00:00.123900Z' WHERE id=$1", [completedRows.rows[0].id])
    await db.query("UPDATE cartcheck.shopping_trips SET completed_at='2026-10-01T12:00:00.123800Z' WHERE id=$1", [completedRows.rows[1].id])
    const historyPage = await (await call('/api/trips?limit=1', { cookie: a })).json()
    const historyNext = await (await call('/api/trips?limit=1&cursor=' + encodeURIComponent(historyPage.nextCursor), { cookie: a })).json()
    assert.equal(historyNext.items[0].id, String(completedRows.rows[1].id), 'historical microsecond pagination must preserve all rows')
  })
})
