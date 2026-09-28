import assert from 'node:assert/strict'
import test from 'node:test'
import { finishTrip } from './tripRepo.js'

test('finish rolls back when creating the replacement active trip fails', async () => {
  const commands = []
  let released = false
  const failure = new Error('injected insert failure')
  const client = {
    async query(sql) {
      commands.push(sql)
      if (sql.includes('SELECT id, status, currency, revision, completed_at')) {
        return { rows: [{ id: '7', status: 'active', currency: 'PHP', revision: 3, completed_at: null }] }
      }
      if (sql.includes('SELECT count(*)::int AS count')) return { rows: [{ count: 1 }] }
      if (sql.includes('INSERT INTO cartcheck.shopping_trips')) throw failure
      return { rows: [{ id: '7', status: 'completed', currency: 'PHP', revision: 4, completed_at: new Date() }] }
    },
    release() { released = true },
  }
  await assert.rejects(finishTrip({ connect: async () => client }, '2', '7', 3), failure)
  assert.equal(commands[0], 'BEGIN')
  assert.ok(commands.some((sql) => sql.includes("status = 'completed'")))
  assert.equal(commands.at(-1), 'ROLLBACK')
  assert.equal(commands.includes('COMMIT'), false)
  assert.equal(released, true)
})
