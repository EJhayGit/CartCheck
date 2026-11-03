import assert from 'node:assert/strict'
import test from 'node:test'
import { finishTrip } from './tripRepo.js'

const now = new Date('2026-10-05T00:00:00.000Z')
const row = (overrides) => ({ id: '7', name: 'Groceries', status: 'active', currency: 'PHP', budget: '500.00',
  revision: 3, created_at: now, updated_at: now, completed_at: null, ...overrides })

function makeClient({ list = row(), itemCount = 2, savedTrip = null } = {}) {
  const commands = []
  const client = {
    commands,
    params: (fragment) => commands.find(({ sql }) => sql.includes(fragment))?.params,
    ran: (fragment) => commands.some(({ sql }) => sql.includes(fragment)),
    last: () => commands.at(-1).sql,
    async query(sql, params) {
      commands.push({ sql, params })
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] }
      if (sql.includes('FOR UPDATE')) return { rows: list ? [list] : [] }
      if (sql.includes('SELECT count(*)::int AS count')) return { rows: [{ count: itemCount }] }
      if (sql.includes('finished_from_revision = $')) return { rows: savedTrip ? [savedTrip] : [] }
      if (sql.includes('INSERT INTO cartcheck.shopping_trips')) {
        return { rows: [row({ id: '50', status: 'completed', revision: 1, completed_at: now })] }
      }
      if (sql.includes('FROM cartcheck.shopping_trips')) return { rows: list ? [list] : [] }
      if (sql.includes('ORDER BY created_at, id')) return { rows: [] }
      if (sql.includes('FROM cartcheck.trip_items')) {
        return { rows: [{ item_count: 0, bought_count: 0, not_bought_count: 0, estimated_total: null,
          estimated_missing_count: 0, actual_total: null, actual_missing_count: 0 }] }
      }
      return { rows: [] }
    },
    release() {},
  }
  return client
}

const finish = (client, ...args) => finishTrip({ connect: async () => client }, '2', '7', ...args)

test('finish saves a new trip and keeps the list row active', async () => {
  const client = makeClient()
  const result = await finish(client, 3)
  assert.equal(result.completedTrip.id, '50')
  assert.equal(result.completedTrip.name, 'Groceries')
  assert.equal(result.list.tripId, '7')
  assert.equal(client.ran("SET status = 'completed'"), false)
  const saved = client.params('INSERT INTO cartcheck.shopping_trips')
  assert.ok(saved.includes('7') && saved.includes(3) && saved.includes('2') && saved.includes('500.00') && saved.includes(now))
  const copied = client.commands.find(({ sql }) => sql.includes('INSERT INTO cartcheck.trip_items'))
  assert.match(copied.sql, /NULL/)
  assert.match(copied.sql, /created_at/)
  assert.ok(client.ran('revision = revision + 1'))
  assert.equal(client.last(), 'COMMIT')
})

test('keep removes bought items and resets the rest', async () => {
  const client = makeClient()
  await finish(client, 3, 'keep')
  const removed = client.commands.find(({ sql }) => sql.includes('DELETE FROM cartcheck.trip_items'))
  assert.match(removed.sql, /AND bought/)
  assert.deepEqual(removed.params, ['2', '7'])
  const reset = client.commands.find(({ sql }) => sql.includes('UPDATE cartcheck.trip_items'))
  assert.match(reset.sql, /bought = false/)
  assert.match(reset.sql, /estimated_total = NULL/)
  assert.match(reset.sql, /actual_total = NULL/)
  assert.deepEqual(reset.params, ['2', '7'])
})

test('keep is the default', async () => {
  const client = makeClient()
  await finish(client, 3)
  assert.match(client.commands.find(({ sql }) => sql.includes('DELETE FROM cartcheck.trip_items')).sql, /AND bought/)
})

test('clear removes every item', async () => {
  const client = makeClient()
  const result = await finish(client, 3, 'clear')
  assert.doesNotMatch(client.commands.find(({ sql }) => sql.includes('DELETE FROM cartcheck.trip_items')).sql, /bought/)
  assert.equal(result.list.tripId, '7')
})

test('retry returns the saved trip without changing anything, whatever it asks for', async () => {
  const savedTrip = row({ id: '50', status: 'completed', revision: 1, completed_at: now })
  const client = makeClient({ list: row({ revision: 4 }), savedTrip })
  const result = await finish(client, 3, 'clear')
  assert.equal(result.completedTrip.id, '50')
  assert.equal(result.list.tripId, '7')
  assert.deepEqual(client.params('finished_from_revision = $'), ['2', '7', 3])
  for (const write of ['INSERT', 'DELETE', 'UPDATE cartcheck']) assert.equal(client.ran(write), false)
  assert.equal(client.last(), 'COMMIT')
})

test('stale revision with no saved trip returns stale', async () => {
  const client = makeClient({ list: row({ revision: 4 }) })
  assert.deepEqual(await finish(client, 3), { error: 'stale' })
  assert.equal(client.last(), 'ROLLBACK')
})

test('empty list returns empty', async () => {
  const client = makeClient({ itemCount: 0 })
  assert.deepEqual(await finish(client, 3), { error: 'empty' })
  assert.equal(client.last(), 'ROLLBACK')
})

test('another account gets not_found', async () => {
  const client = makeClient({ list: null })
  assert.deepEqual(await finish(client, 3), { error: 'not_found' })
  assert.deepEqual(client.params('FOR UPDATE'), ['7', '2'])
  assert.equal(client.last(), 'ROLLBACK')
})

test('a row completed before this change returns its trip with no list', async () => {
  const client = makeClient({ list: row({ status: 'completed', revision: 4, completed_at: now }) })
  const result = await finish(client, 3)
  assert.equal(result.completedTrip.id, '7')
  assert.equal(result.list, null)
  for (const write of ['INSERT', 'DELETE', 'UPDATE cartcheck']) assert.equal(client.ran(write), false)
  assert.equal(client.last(), 'COMMIT')
})
