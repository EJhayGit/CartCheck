import assert from 'node:assert/strict'
import test from 'node:test'
import { createListFromTrip, getActiveList } from './listRepo.js'

test('active detail reads lock the parent for the full snapshot transaction', async () => {
  const commands = []
  const now = new Date('2026-10-05T00:00:00.000Z')
  const client = {
    async query(sql) {
      commands.push(sql)
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] }
      if (sql.includes('FROM cartcheck.shopping_trips')) return { rows: [{ id: '9', name: 'Market', status: 'active',
        currency: 'PHP', budget: null, revision: 4, created_at: now, updated_at: now }] }
      if (sql.includes('ORDER BY created_at, id')) return { rows: [] }
      if (sql.includes('count(*)::int AS item_count')) return { rows: [{ item_count: 0, bought_count: 0,
        not_bought_count: 0, estimated_total: null, estimated_missing_count: 0, actual_total: null,
        actual_missing_count: 0 }] }
      throw new Error(`Unexpected query: ${sql}`)
    },
    release() { commands.push('RELEASE') },
  }
  const result = await getActiveList({ connect: async () => client }, '3', '9')
  assert.equal(result.tripId, '9')
  assert.deepEqual(commands[0], 'BEGIN')
  assert.match(commands[1], /status = 'active' FOR UPDATE/)
  assert.ok(commands.findIndex((sql) => sql.includes('ORDER BY created_at, id')) < commands.indexOf('COMMIT'))
  assert.equal(commands.at(-1), 'RELEASE')
})

test('reusing a trip copies its owned snapshot into a fresh list without prices or bought state', async () => {
  const commands = []
  const now = new Date('2026-10-30T00:00:00.000Z')
  const client = {
    async query(sql, values) {
      commands.push({ sql, values })
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] }
      if (sql.includes("status='completed' FOR SHARE")) return { rowCount: 1, rows: [{ id: '7', name: 'Saturday' }] }
      if (sql.includes('INSERT INTO cartcheck.shopping_trips')) return { rows: [{ id: '11', name: values[1], status: 'active',
        currency: 'PHP', budget: null, revision: 1, created_at: now, updated_at: now }] }
      if (sql.includes('INSERT INTO cartcheck.trip_items')) return { rowCount: 2, rows: [] }
      if (sql.includes('FROM cartcheck.shopping_trips')) return { rows: [{ id: '11', name: 'Saturday', status: 'active',
        currency: 'PHP', budget: null, revision: 1, created_at: now, updated_at: now }] }
      if (sql.includes('ORDER BY created_at, id')) return { rows: [] }
      if (sql.includes('count(*)::int AS item_count')) return { rows: [{ item_count: 0, bought_count: 0,
        not_bought_count: 0, estimated_total: null, estimated_missing_count: 0, actual_total: null, actual_missing_count: 0 }] }
      throw new Error(`Unexpected query: ${sql}`)
    },
    release() {},
  }
  const list = await createListFromTrip({ connect: async () => client }, '3', '7', { items: 'notBought', name: null })
  assert.equal(list.tripId, '11')
  const lock = commands.find(({ sql }) => sql.includes('FOR SHARE'))
  assert.deepEqual(lock.values, ['7', '3'])
  assert.equal(commands.find(({ sql }) => sql.includes('INSERT INTO cartcheck.shopping_trips')).values[1], 'Saturday')
  const copy = commands.find(({ sql }) => sql.includes('INSERT INTO cartcheck.trip_items'))
  assert.match(copy.sql, /AND NOT ti\.bought/)
  assert.match(copy.sql, /p\.user_id = \$1/)
  assert.doesNotMatch(copy.sql, /estimated_total|actual_total|bought\)/)
  assert.deepEqual(copy.values, ['3', '11', '7'])
})

test('reusing a missing or foreign trip creates nothing', async () => {
  const commands = []
  const client = {
    async query(sql) { commands.push(sql); return sql.includes('FOR SHARE') ? { rowCount: 0, rows: [] } : { rows: [] } },
    release() {},
  }
  assert.equal(await createListFromTrip({ connect: async () => client }, '3', '99', { items: 'all', name: null }), null)
  assert.equal(commands.some((sql) => sql.includes('INSERT')), false)
})
