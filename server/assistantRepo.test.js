import assert from 'node:assert/strict'
import test from 'node:test'
import { getUsage, refundMessage, reserveMessage } from './assistantRepo.js'

const resetsAt = new Date('2026-11-06T08:00:00.000Z')
const limits = { dailyLimit: 5, appLimit: 100 }

// Models the two conditional upserts: a count at its limit returns no row.
function fakePool({ account = 0, app = 0, failOn = null } = {}) {
  const state = { account, app, commands: [], released: 0 }
  const client = {
    async query(sql, values) {
      state.commands.push({ sql, values })
      if (failOn && sql.includes(failOn)) throw new Error('database failed')
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] }
      if (sql.includes('resets_at')) return { rows: [{ usage_date: '2026-11-05', resets_at: resetsAt }] }
      if (sql.includes('INSERT INTO cartcheck.assistant_usage')) {
        if (state.account >= values[2]) return { rows: [] }
        state.account += 1
        return { rows: [{ message_count: state.account }] }
      }
      if (sql.includes('INSERT INTO cartcheck.assistant_app_usage')) {
        if (state.app >= values[1]) return { rows: [] }
        state.app += 1
        return { rows: [{ message_count: state.app }] }
      }
      throw new Error(`Unexpected query: ${sql}`)
    },
    release() { state.released += 1 },
  }
  return { state, connect: async () => client }
}

test('the first message leaves four and commits before returning', async () => {
  const pool = fakePool()
  const result = await reserveMessage(pool, '3', limits)
  assert.deepEqual(result, { usageDate: '2026-11-05', usage: { limit: 5, remaining: 4, resetsAt: resetsAt.toISOString() } })
  assert.equal(pool.state.commands.at(-1).sql, 'COMMIT')
  assert.equal(pool.state.released, 1)
})

test('the fifth message succeeds and leaves none', async () => {
  const result = await reserveMessage(fakePool({ account: 4 }), '3', limits)
  assert.equal(result.usage.remaining, 0)
})

test('the sixth message is refused without touching the app-wide count', async () => {
  const pool = fakePool({ account: 5, app: 7 })
  const result = await reserveMessage(pool, '3', limits)
  assert.deepEqual(result, { error: 'daily_limit', resetsAt: resetsAt.toISOString() })
  assert.equal(pool.state.app, 7)
  assert.ok(!pool.state.commands.some(({ sql }) => sql.includes('assistant_app_usage')))
  assert.equal(pool.state.commands.at(-1).sql, 'ROLLBACK')
  assert.equal(pool.state.released, 1)
})

test('a full app-wide cap rolls back so the account is not charged', async () => {
  const pool = fakePool({ app: 100 })
  const result = await reserveMessage(pool, '3', limits)
  assert.deepEqual(result, { error: 'app_limit', resetsAt: resetsAt.toISOString() })
  assert.equal(pool.state.commands.at(-1).sql, 'ROLLBACK')
  assert.ok(!pool.state.commands.some(({ sql }) => sql === 'COMMIT'))
  assert.equal(pool.state.released, 1)
})

test('the account row is locked before the app row', async () => {
  const pool = fakePool()
  await reserveMessage(pool, '3', limits)
  const tables = pool.state.commands.map(({ sql }) => sql.match(/INSERT INTO cartcheck\.(\w+)/)?.[1]).filter(Boolean)
  assert.deepEqual(tables, ['assistant_usage', 'assistant_app_usage'])
})

test('a database failure rolls back and still releases the connection', async () => {
  const pool = fakePool({ failOn: 'assistant_app_usage' })
  await assert.rejects(reserveMessage(pool, '3', limits), /database failed/)
  assert.equal(pool.state.commands.at(-1).sql, 'ROLLBACK')
  assert.equal(pool.state.released, 1)
})

test('a refund uses the reserved date and the signed-in account, and leaves the app count alone', async () => {
  const commands = []
  await refundMessage({ query: async (sql, values) => { commands.push({ sql, values }); return { rows: [] } } }, '3', '2026-11-05')
  assert.equal(commands.length, 1)
  assert.match(commands[0].sql, /UPDATE cartcheck\.assistant_usage/)
  assert.match(commands[0].sql, /user_id = \$1 AND usage_date = \$2/)
  assert.match(commands[0].sql, /message_count > 0/)
  assert.deepEqual(commands[0].values, ['3', '2026-11-05'])
})

test('usage reports what is left today for that account', async () => {
  const commands = []
  const usage = await getUsage({ query: async (sql, values) => { commands.push({ sql, values }); return { rows: [{ message_count: 2, resets_at: resetsAt }] } } }, '3', 5)
  assert.deepEqual(usage, { limit: 5, remaining: 3, resetsAt: resetsAt.toISOString() })
  assert.deepEqual(commands[0].values, ['3'])
})

test('usage never goes below zero after the limit is lowered', async () => {
  const usage = await getUsage({ query: async () => ({ rows: [{ message_count: 9, resets_at: resetsAt }] }) }, '3', 5)
  assert.equal(usage.remaining, 0)
})
