import assert from 'node:assert/strict'
import test from 'node:test'
import { finishTrip } from './tripRepo.js'

function makeClient(initialStatus = 'active') {
  const commands = []
  const now = new Date('2026-10-05T00:00:00.000Z')
  const client = {
    commands,
    async query(sql) {
      commands.push(sql)
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] }
      if (sql.includes('FOR UPDATE')) return { rows: [{ id: '7', name: 'Groceries', status: initialStatus,
        currency: 'PHP', budget: null, revision: initialStatus === 'active' ? 3 : 4,
        created_at: now, updated_at: now, completed_at: initialStatus === 'completed' ? now : null }] }
      if (sql.includes('SELECT count(*)::int AS count')) return { rows: [{ count: 1 }] }
      if (sql.includes("SET status = 'completed'")) return { rows: [{ id: '7', name: 'Groceries', status: 'completed',
        currency: 'PHP', budget: null, revision: 4, created_at: now, updated_at: now, completed_at: now }] }
      if (sql.includes('FROM cartcheck.trip_items WHERE user_id = $1 AND trip_id = $2 ORDER BY')) return { rows: [] }
      if (sql.includes('FROM cartcheck.trip_items WHERE user_id = $1 AND trip_id = $2')) {
        return { rows: [{ estimated_total: null, estimated_missing_count: 0, actual_total: null, actual_missing_count: 0 }] }
      }
      return { rows: [] }
    },
    release() {},
  }
  return client
}

test('finish commits history without creating a replacement list', async () => {
  const client = makeClient()
  const result = await finishTrip({ connect: async () => client }, '2', '7', 3)
  assert.equal(result.completedTrip.id, '7')
  assert.equal(result.completedTrip.name, 'Groceries')
  assert.equal(result.activeTrip, undefined)
  assert.ok(client.commands.some((sql) => sql.includes('product_id = NULL')))
  assert.ok(client.commands.some((sql) => sql.includes('updated_at = now()')))
  assert.equal(client.commands.some((sql) => sql.includes('INSERT INTO cartcheck.shopping_trips')), false)
  assert.equal(client.commands.at(-1), 'COMMIT')
})

test('finish retries return the saved history without mutating or creating lists', async () => {
  const client = makeClient('completed')
  const result = await finishTrip({ connect: async () => client }, '2', '7', 3)
  assert.equal(result.completedTrip.name, 'Groceries')
  assert.equal(client.commands.some((sql) => sql.includes("SET status = 'completed'")), false)
  assert.equal(client.commands.some((sql) => sql.includes('INSERT INTO cartcheck.shopping_trips')), false)
  assert.equal(client.commands.at(-1), 'COMMIT')
})
