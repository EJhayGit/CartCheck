import assert from 'node:assert/strict'
import test from 'node:test'
import { getActiveList } from './listRepo.js'

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
