import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { randomUUID } from 'node:crypto'
import pg from 'pg'

const databaseUrl = process.env.CARTCHECK_TEST_DATABASE_URL

async function unusedPort() {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function waitForServer(baseUrl, child, output) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`API exited before becoming ready: ${output()}`)
    try { if ((await fetch(`${baseUrl}/readyz`)).ok) return } catch { /* Server is starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`API did not become ready: ${output()}`)
}

function cookiePair(response) {
  const value = response.headers.get('set-cookie')
  assert.ok(value, 'registration should set a session cookie')
  return value.split(';', 1)[0]
}

async function request(baseUrl, path, { method = 'GET', body, cookie } = {}) {
  const headers = { origin: 'http://localhost:5173' }
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (cookie) headers.cookie = cookie
  return fetch(`${baseUrl}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
}

test('cart lifecycle, snapshots, validation, and account isolation', {
  skip: !databaseUrl && 'Set CARTCHECK_TEST_DATABASE_URL to a disposable PostgreSQL database to run API integration tests',
}, async (t) => {
  const client = new pg.Client({ connectionString: databaseUrl })
  await client.connect()
  const suffix = randomUUID()
  const emails = [`m4-a-${suffix}@example.test`, `m4-b-${suffix}@example.test`]
  const passwords = [randomUUID() + 'A1!', randomUUID() + 'B1!']
  const port = await unusedPort()
  const baseUrl = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('.', import.meta.url),
    env: { ...process.env, DATABASE_URL: databaseUrl, PORT: String(port), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  child.stdout.setEncoding('utf8').on('data', (chunk) => { logs += chunk })
  child.stderr.setEncoding('utf8').on('data', (chunk) => { logs += chunk })
  t.after(async () => {
    child.kill()
    if (child.exitCode === null) await once(child, 'exit')
    try {
      await client.query('DELETE FROM cartcheck.trip_items WHERE user_id IN (SELECT id FROM cartcheck.users WHERE email = ANY($1::text[]))', [emails])
      await client.query('DELETE FROM cartcheck.users WHERE email = ANY($1::text[])', [emails])
    } finally { await client.end() }
  })

  try {
    await waitForServer(baseUrl, child, () => logs)
    assert.equal((await request(baseUrl, '/api/cart')).status, 401)
    assert.equal((await request(baseUrl, '/api/cart/items', { method: 'POST', body: { productId: '1' } })).status, 401)
    assert.equal((await request(baseUrl, '/api/cart/items/1', { method: 'PATCH', body: { quantity: 2 } })).status, 401)
    assert.equal((await request(baseUrl, '/api/cart/items/1', { method: 'DELETE' })).status, 401)

    const registrations = await Promise.all(emails.map((email, index) => request(baseUrl, '/api/auth/register', {
      method: 'POST', body: { email, password: passwords[index] },
    })))
    assert.deepEqual(registrations.map((response) => response.status), [201, 201])
    const [cookieA, cookieB] = registrations.map(cookiePair)

    const accounts = await client.query('SELECT id, email FROM cartcheck.users WHERE email = ANY($1::text[])', [emails])
    assert.equal(accounts.rows.length, 2)
    const userB = accounts.rows.find((row) => row.email === emails[1])
    await client.query("DELETE FROM cartcheck.shopping_trips WHERE user_id = $1 AND status = 'active'", [userB.id])
    assert.equal((await request(baseUrl, '/api/cart', { cookie: cookieB })).status, 200,
      'a missing active trip is created when the list is opened')
    const activeCounts = await client.query(
      "SELECT user_id, count(*)::int AS count FROM cartcheck.shopping_trips WHERE user_id = ANY($1::bigint[]) AND status = 'active' GROUP BY user_id",
      [accounts.rows.map((row) => row.id)]
    )
    assert.deepEqual(activeCounts.rows.map((row) => row.count).sort(), [1, 1])

    const empty = await request(baseUrl, '/api/cart', { cookie: cookieA })
    assert.equal(empty.status, 200)
    const initial = await empty.json()
    assert.deepEqual(initial.items, [])
    assert.equal(typeof initial.currency, 'string')

    const catalogA = await (await request(baseUrl, '/api/catalog', { cookie: cookieA })).json()
    const starter = catalogA.items.find((product) => product.name === 'Apples')
    assert.ok(starter, 'registration should provision starter products')
    const addedStarter = await request(baseUrl, '/api/cart/items', { method: 'POST', cookie: cookieA, body: { productId: starter.id } })
    assert.equal(addedStarter.status, 201)
    const starterResult = await addedStarter.json()
    assert.equal(starterResult.created, true)
    assert.equal(starterResult.item.productId, starter.id)
    assert.equal(starterResult.item.name, starter.name)
    assert.equal(starterResult.item.category, starter.category)
    assert.equal(starterResult.item.quantity, '1.000')
    assert.equal(starterResult.item.unitLabel, null)
    assert.equal(starterResult.item.bought, false)

    const duplicate = await request(baseUrl, '/api/cart/items', { method: 'POST', cookie: cookieA, body: { productId: starter.id } })
    assert.equal(duplicate.status, 200)
    const duplicateBody = await duplicate.json()
    assert.equal(duplicateBody.created, false)
    assert.equal(duplicateBody.item.id, starterResult.item.id)
    const concurrentDuplicates = await Promise.all(Array.from({ length: 3 }, () => request(baseUrl, '/api/cart/items', {
      method: 'POST', cookie: cookieA, body: { productId: starter.id },
    })))
    assert.deepEqual(concurrentDuplicates.map((response) => response.status), [200, 200, 200])
    const duplicateCount = await client.query(
      'SELECT count(*)::int AS count FROM cartcheck.trip_items WHERE product_id = $1 AND user_id = $2',
      [starter.id, accounts.rows.find((row) => row.email === emails[0]).id]
    )
    assert.equal(duplicateCount.rows[0].count, 1)

    const customName = `Private flour ${suffix}`
    const customResponse = await request(baseUrl, '/api/catalog', {
      method: 'POST', cookie: cookieA, body: { name: customName, category: 'Other' },
    })
    assert.equal(customResponse.status, 201)
    const customProduct = (await customResponse.json()).item
    assert.equal((await request(baseUrl, '/api/catalog', { cookie: cookieB })).status, 200)
    assert.equal((await request(baseUrl, '/api/cart/items', { method: 'POST', cookie: cookieB, body: { productId: customProduct.id } })).status, 404,
      'another account cannot add a private catalog product')

    const addedCustom = await request(baseUrl, '/api/cart/items', { method: 'POST', cookie: cookieA, body: { productId: customProduct.id } })
    assert.equal(addedCustom.status, 201)
    const customItem = (await addedCustom.json()).item
    assert.equal(customItem.bought, false)
    const patch = await request(baseUrl, `/api/cart/items/${customItem.id}`, {
      method: 'PATCH', cookie: cookieA, body: { name: 'Whole wheat flour', quantity: 2.5, unitLabel: 'kg' },
    })
    assert.equal(patch.status, 200)
    assert.deepEqual((await patch.json()).item, { ...customItem, name: 'Whole wheat flour', quantity: '2.500', unitLabel: 'kg' })

    const buyStarter = await request(baseUrl, `/api/cart/items/${starterResult.item.id}`, {
      method: 'PATCH', cookie: cookieA, body: { bought: true },
    })
    assert.equal(buyStarter.status, 200)
    assert.equal((await buyStarter.json()).item.bought, true)
    const buyCustom = await request(baseUrl, `/api/cart/items/${customItem.id}`, {
      method: 'PATCH', cookie: cookieA, body: { bought: true },
    })
    assert.equal(buyCustom.status, 200)
    assert.equal((await buyCustom.json()).item.bought, true)
    let shoppingProgress = await (await request(baseUrl, '/api/cart', { cookie: cookieA })).json()
    assert.equal(shoppingProgress.items.filter((item) => item.bought).length, 2,
      'multiple purchases persist after retrieval')
    const unbuyCustom = await request(baseUrl, `/api/cart/items/${customItem.id}`, {
      method: 'PATCH', cookie: cookieA, body: { bought: false },
    })
    assert.equal(unbuyCustom.status, 200)
    assert.equal((await unbuyCustom.json()).item.bought, false)
    shoppingProgress = await (await request(baseUrl, '/api/cart', { cookie: cookieA })).json()
    assert.equal(shoppingProgress.items.filter((item) => item.bought).length, 1)
    assert.equal(shoppingProgress.items.filter((item) => !item.bought).length, 1)
    const catalogAfterPurchase = await client.query(
      'SELECT id, name, category FROM cartcheck.products WHERE id = ANY($1::bigint[])',
      [[starter.id, customProduct.id]]
    )
    assert.equal(catalogAfterPurchase.rows.find((row) => String(row.id) === starter.id)?.name, starter.name)
    assert.equal(catalogAfterPurchase.rows.find((row) => String(row.id) === customProduct.id)?.name, customName,
      'purchase toggles do not edit catalog rows')

    await request(baseUrl, `/api/catalog/${customProduct.id}`, { method: 'PATCH', cookie: cookieA, body: { name: 'Renamed catalog product' } })
    const persisted = await (await request(baseUrl, '/api/cart', { cookie: cookieA })).json()
    assert.equal(persisted.currency, initial.currency)
    assert.equal(persisted.items.length, 2)
    assert.deepEqual(persisted.items[1], { ...customItem, name: 'Whole wheat flour', quantity: '2.500', unitLabel: 'kg' },
      'cart item keeps its name snapshot and edits after reload')
    assert.equal(persisted.items[0].bought, true, 'bought status survives retrieval')

    const cartB = await (await request(baseUrl, '/api/cart', { cookie: cookieB })).json()
    assert.deepEqual(cartB.items, [], 'accounts have separate carts')
    const starterB = (await (await request(baseUrl, '/api/catalog', { cookie: cookieB })).json()).items.find((product) => product.name === 'Apples')
    const addedB = await request(baseUrl, '/api/cart/items', { method: 'POST', cookie: cookieB, body: { productId: starterB.id } })
    assert.equal(addedB.status, 201)
    const itemB = (await addedB.json()).item
    assert.equal((await request(baseUrl, `/api/cart/items/${itemB.id}`, { method: 'PATCH', cookie: cookieA, body: { bought: true } })).status, 404)
    assert.equal((await request(baseUrl, `/api/cart/items/${itemB.id}`, { method: 'PATCH', cookie: cookieA, body: { bought: false } })).status, 404)
    assert.equal((await request(baseUrl, `/api/cart/items/${customItem.id}`, { method: 'PATCH', cookie: cookieB, body: { bought: true } })).status, 404)
    assert.equal((await (await request(baseUrl, '/api/cart', { cookie: cookieB })).json()).items[0].bought, false)
    assert.equal((await request(baseUrl, `/api/cart/items/${customItem.id}`, { method: 'PATCH', cookie: cookieB, body: { quantity: 9 } })).status, 404)
    assert.equal((await request(baseUrl, `/api/cart/items/${customItem.id}`, { method: 'DELETE', cookie: cookieB })).status, 404)

    for (const body of [{}, { productId: starter.id, extra: true }, { productId: 'x' }, { productId: [starter.id] }]) {
      assert.equal((await request(baseUrl, '/api/cart/items', { method: 'POST', cookie: cookieA, body })).status, 400)
    }
    assert.equal((await request(baseUrl, `/api/cart/items/${customItem.id}`, { method: 'PATCH', cookie: cookieA, body: { quantity: 0 } })).status, 400)
    assert.equal((await request(baseUrl, `/api/cart/items/${customItem.id}`, { method: 'PATCH', cookie: cookieA, body: { unitLabel: 4 } })).status, 400)
    assert.equal((await request(baseUrl, `/api/cart/items/${customItem.id}`, { method: 'PATCH', cookie: cookieA, body: { category: 'Other' } })).status, 400)
    assert.equal((await request(baseUrl, `/api/cart/items/${customItem.id}`, { method: 'PATCH', cookie: cookieA, body: { bought: 'true' } })).status, 400)
    assert.equal((await request(baseUrl, '/api/cart/items/not-an-id', { method: 'PATCH', cookie: cookieA, body: { bought: true } })).status, 400)
    assert.equal((await request(baseUrl, '/api/cart/items/999999999999', { method: 'PATCH', cookie: cookieA, body: { bought: true } })).status, 404)
    assert.equal((await request(baseUrl, '/api/cart/items/not-an-id', { method: 'DELETE', cookie: cookieA })).status, 400)

    const removed = await request(baseUrl, `/api/cart/items/${customItem.id}`, { method: 'DELETE', cookie: cookieA })
    assert.equal(removed.status, 204)
    const afterRemove = await (await request(baseUrl, '/api/cart', { cookie: cookieA })).json()
    assert.deepEqual(afterRemove.items.map((item) => item.id), [starterResult.item.id])
  } catch (error) {
    throw new Error(`${error.message}\nAPI output:\n${logs}`)
  }
})
