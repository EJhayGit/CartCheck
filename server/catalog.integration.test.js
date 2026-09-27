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
    try {
      if ((await fetch(`${baseUrl}/readyz`)).ok) return
    } catch { /* The child has not bound its port yet. */ }
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
  return fetch(`${baseUrl}${path}`, {
    method, headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

test('authenticated catalog search, starter protection, and custom product isolation', {
  skip: !databaseUrl && 'Set CARTCHECK_TEST_DATABASE_URL to a disposable PostgreSQL database to run API integration tests',
}, async (t) => {
  const client = new pg.Client({ connectionString: databaseUrl })
  await client.connect()
  const suffix = randomUUID()
  const emails = [`m3-a-${suffix}@example.test`, `m3-b-${suffix}@example.test`]
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
    await client.query('DELETE FROM cartcheck.users WHERE email = ANY($1::text[])', [emails])
    await client.end()
  })

  try {
    await waitForServer(baseUrl, child, () => logs)
    const unauthenticated = await request(baseUrl, '/api/catalog')
    assert.equal(unauthenticated.status, 401)
    assert.equal((await request(baseUrl, '/api/catalog', { method: 'POST', body: { name: 'X', category: 'Other' } })).status, 401)
    assert.equal((await request(baseUrl, '/api/catalog/1', { method: 'PATCH', body: { name: 'X' } })).status, 401)
    assert.equal((await request(baseUrl, '/api/catalog/1', { method: 'DELETE' })).status, 401)

    const registrations = await Promise.all(emails.map((email, index) => request(baseUrl, '/api/auth/register', {
      method: 'POST', body: { email, password: passwords[index] },
    })))
    assert.deepEqual(registrations.map((response) => response.status), [201, 201])
    const [cookieA, cookieB] = registrations.map(cookiePair)

    const initial = await request(baseUrl, '/api/catalog', { cookie: cookieA })
    assert.equal(initial.status, 200)
    const initialBody = await initial.json()
    assert.equal(initialBody.items.length, 108, 'catalog should expose all 108 starter products')
    assert.ok(initialBody.items.every((item) => item.source === 'starter' && item.id && item.name && item.category))
    assert.ok(initialBody.categories.includes('Produce'))
    assert.equal(new Set(initialBody.categories).size, initialBody.categories.length)

    const search = await request(baseUrl, '/api/catalog?search=appl', { cookie: cookieA })
    assert.equal(search.status, 200)
    const searchBody = await search.json()
    assert.ok(searchBody.items.some((item) => item.name === 'Apples'))
    assert.ok(searchBody.items.every((item) => item.name.toLowerCase().includes('appl')))
    const literalWildcard = await request(baseUrl, '/api/catalog?search=%25', { cookie: cookieA })
    assert.equal((await literalWildcard.json()).items.length, 0, 'search wildcards are literal')

    const category = await request(baseUrl, '/api/catalog?category=Produce', { cookie: cookieA })
    assert.equal(category.status, 200)
    assert.ok((await category.json()).items.every((item) => item.category === 'Produce'))
    const combined = await request(baseUrl, '/api/catalog?search=appl&category=Produce', { cookie: cookieA })
    assert.ok((await combined.json()).items.every((item) => item.name.toLowerCase().includes('appl') && item.category === 'Produce'))

    const created = await request(baseUrl, '/api/catalog', {
      method: 'POST', cookie: cookieA, body: { name: `Test cereal ${suffix}`, category: 'Other' },
    })
    assert.equal(created.status, 201)
    const item = (await created.json()).item
    assert.equal(item.source, 'custom')
    assert.equal(item.name, `Test cereal ${suffix}`)
    assert.equal(item.category, 'Other')
    const itemPath = `/api/catalog/${encodeURIComponent(item.id)}`

    const listed = await request(baseUrl, '/api/catalog?category=Other', { cookie: cookieA })
    assert.ok((await listed.json()).items.some((entry) => String(entry.id) === String(item.id)))
    const hidden = await request(baseUrl, '/api/catalog?category=Other', { cookie: cookieB })
    assert.ok(!(await hidden.json()).items.some((entry) => String(entry.id) === String(item.id)))

    const invalidBody = await request(baseUrl, '/api/catalog', {
      method: 'POST', cookie: cookieA, body: { name: '   ', category: 'Other' },
    })
    assert.equal(invalidBody.status, 400)
    const invalidCategory = await request(baseUrl, '/api/catalog', {
      method: 'POST', cookie: cookieA, body: { name: 'Invalid category', category: 'Test pantry' },
    })
    assert.equal(invalidCategory.status, 400)
    const invalidId = await request(baseUrl, '/api/catalog/not-a-number', { cookie: cookieA, method: 'PATCH', body: { name: 'X' } })
    assert.equal(invalidId.status, 400)
    const missingId = await request(baseUrl, '/api/catalog/999999999999999', { cookie: cookieA, method: 'DELETE' })
    assert.equal(missingId.status, 404)

    const starter = initialBody.items.find((entry) => entry.name === 'Apples')
    const starterPatch = await request(baseUrl, `/api/catalog/${encodeURIComponent(starter.id)}`, {
      method: 'PATCH', cookie: cookieA, body: { name: 'Corrupted starter', category: 'Other' },
    })
    assert.ok(starterPatch.status >= 400, 'starter entries must reject edits')
    const starterDelete = await request(baseUrl, `/api/catalog/${encodeURIComponent(starter.id)}`, { method: 'DELETE', cookie: cookieA })
    assert.ok(starterDelete.status >= 400, 'starter entries must reject deletion')
    const starterStillThere = await request(baseUrl, '/api/catalog?search=apples', { cookie: cookieA })
    assert.ok((await starterStillThere.json()).items.some((entry) => entry.name === 'Apples' && entry.source === 'starter'))

    const foreignPatch = await request(baseUrl, itemPath, {
      method: 'PATCH', cookie: cookieB, body: { name: 'Stolen edit' },
    })
    const foreignDelete = await request(baseUrl, itemPath, { method: 'DELETE', cookie: cookieB })
    assert.equal(foreignPatch.status, 404, 'foreign edit should not reveal whether the item exists')
    assert.equal(foreignDelete.status, 404, 'foreign delete should not reveal whether the item exists')
    const ownedAfterForeign = await request(baseUrl, '/api/catalog?category=Other', { cookie: cookieA })
    assert.ok((await ownedAfterForeign.json()).items.some((entry) => String(entry.id) === String(item.id) && entry.name === item.name))

    const updated = await request(baseUrl, itemPath, {
      method: 'PATCH', cookie: cookieA, body: { name: `Updated cereal ${suffix}` },
    })
    assert.equal(updated.status, 200)
    assert.equal((await updated.json()).item.name, `Updated cereal ${suffix}`)
    const deleted = await request(baseUrl, itemPath, { method: 'DELETE', cookie: cookieA })
    assert.equal(deleted.status, 204)
    const absent = await request(baseUrl, `/api/catalog?search=${encodeURIComponent(`Updated cereal ${suffix}`)}`, { cookie: cookieA })
    assert.ok(!(await absent.json()).items.some((entry) => String(entry.id) === String(item.id)))
  } catch (error) {
    throw new Error(`${error.message}\nAPI output:\n${logs}`)
  }
})
