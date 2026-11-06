import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { poolConfig } from './db/config.js'
import { getUsage, refundMessage, reserveMessage } from './assistantRepo.js'
import { assertUnusedTestEmails, cleanupTestEmails, testEmails } from './testDatabaseSafety.js'

const runId = process.env.CARTCHECK_TEST_RUN_ID
const databaseUrl = runId && process.env.CARTCHECK_TEST_DATABASE_URL

test('assistant quota holds under parallel sends and stays per account', {
  skip: !databaseUrl && 'Use an explicitly isolated database runner for API tests',
}, async (t) => {
  const pool = new pg.Pool(poolConfig({ ...process.env, DATABASE_URL: databaseUrl }))
  // Fresh addresses, so this test can't collide with the runner's shared set.
  const emails = testEmails(randomUUID()).slice(0, 2)
  const clock = await pool.query(`SELECT (now() AT TIME ZONE 'America/Los_Angeles')::date::text AS today`)
  const today = clock.rows[0].today
  const appBefore = (await pool.query('SELECT message_count FROM cartcheck.assistant_app_usage WHERE usage_date = $1', [today])).rows[0]?.message_count ?? 0
  const appCount = async () => (await pool.query('SELECT message_count FROM cartcheck.assistant_app_usage WHERE usage_date = $1', [today])).rows[0]?.message_count ?? 0
  t.after(async () => {
    const client = await pool.connect()
    try {
      await cleanupTestEmails(client, emails)
      // Put the shared count back, because other accounts' messages also live in it.
      await client.query('UPDATE cartcheck.assistant_app_usage SET message_count = $2 WHERE usage_date = $1', [today, appBefore])
      if (!appBefore) await client.query('DELETE FROM cartcheck.assistant_app_usage WHERE usage_date = $1 AND message_count = 0', [today])
    } finally { client.release() }
    await pool.end()
  })
  await assertUnusedTestEmails(pool, emails)
  const users = await pool.query(
    `INSERT INTO cartcheck.users (email, password_hash) VALUES ($1, 'test-only'), ($2, 'test-only') RETURNING id`, emails,
  )
  const [userA, userB] = users.rows.map((row) => row.id)
  const limits = { dailyLimit: 5, appLimit: appBefore + 1000 }

  const parallel = await Promise.all(Array.from({ length: 8 }, () => reserveMessage(pool, userA, limits)))
  assert.equal(parallel.filter((result) => !result.error).length, 5)
  assert.equal(parallel.filter((result) => result.error === 'daily_limit').length, 3)
  assert.equal((await getUsage(pool, userA, 5)).remaining, 0)
  assert.equal(await appCount(), appBefore + 5, 'refused messages leave the app-wide count alone')

  const other = await reserveMessage(pool, userB, limits)
  assert.equal(other.usage.remaining, 4, 'each account has its own count')

  await refundMessage(pool, userA, parallel.find((result) => !result.error).usageDate)
  assert.equal((await getUsage(pool, userA, 5)).remaining, 1)
  assert.equal((await getUsage(pool, userB, 5)).remaining, 4, 'a refund touches only that account')
  assert.equal(await appCount(), appBefore + 6, 'a refund leaves the app-wide count alone')

  const capped = await reserveMessage(pool, userB, { dailyLimit: 5, appLimit: appBefore + 6 })
  assert.equal(capped.error, 'app_limit')
  assert.equal((await getUsage(pool, userB, 5)).remaining, 4, 'a full cap does not charge the account')
  assert.ok(Date.parse(capped.resetsAt) > Date.now())
})
