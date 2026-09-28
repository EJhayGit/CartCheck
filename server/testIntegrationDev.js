// Guarded Milestone 7 API integration run against the configured Supabase development database.
// Invoke with: node --env-file=.env testIntegrationDev.js
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { poolConfig } from './db/config.js'
import { approvedTestTarget, assertUnusedTestEmails, cleanupTestEmails, fingerprintExistingRows, testEmails } from './testDatabaseSafety.js'

const databaseUrl = process.env.DATABASE_URL
const target = approvedTestTarget(databaseUrl, process.env.CARTCHECK_TEST_PROJECT_REF, process.env.NODE_ENV)
assert.equal(process.env.CARTCHECK_TEST_DATABASE_URL, undefined,
  'Do not supply a second database URL; this runner uses the configured development DATABASE_URL')

const client = new pg.Client(poolConfig(process.env))
const runId = randomUUID()
const emails = testEmails(runId)
const manifestDirectory = join(dirname(fileURLToPath(import.meta.url)), '.test-runs')
const manifestPath = join(manifestDirectory, `${runId}.json`)
assert.ok(!existsSync(manifestDirectory) || readdirSync(manifestDirectory).length === 0,
  'An earlier test run manifest remains. Verify and clean that run before starting another.')
let baseline = null
let protectedIds = []
let testExit = 1

try {
  await client.connect()
  assert.equal(client.connection.stream.encrypted, true, 'Supabase connection must use verified TLS')
  const identity = await client.query('SELECT current_database() AS database, current_user AS role')
  assert.equal(identity.rows[0].database, 'postgres')
  const schema = await client.query(
    `SELECT is_nullable FROM information_schema.columns
     WHERE table_schema = 'cartcheck' AND table_name = 'trip_items' AND column_name = 'product_id'`
  )
  assert.equal(schema.rows[0]?.is_nullable, 'YES', 'Milestone 7 migration must be applied first')
  await assertUnusedTestEmails(client, emails)
  const existing = await client.query('SELECT id FROM cartcheck.users ORDER BY id')
  protectedIds = existing.rows.map((row) => row.id)
  baseline = await fingerprintExistingRows(client, protectedIds)
  mkdirSync(manifestDirectory, { recursive: true })
  writeFileSync(manifestPath, JSON.stringify({ runId, emails, protectedIds: protectedIds.map(String),
    baseline, host: target.hostname, database: identity.rows[0].database, role: identity.rows[0].role }, null, 2),
  { flag: 'wx', mode: 0o600 })
  console.log(`Guarded integration run ${runId}: ${protectedIds.length} pre-existing account(s) protected; six unique temporary emails verified absent.`)

  const child = spawn(process.execPath, [
    '--test', '--test-concurrency=1',
    'auth.integration.test.js', 'catalog.integration.test.js', 'cart.integration.test.js',
  ], {
    cwd: new URL('.', import.meta.url),
    env: { ...process.env, CARTCHECK_TEST_DATABASE_URL: databaseUrl, CARTCHECK_TEST_RUN_ID: runId },
    stdio: 'inherit',
  })
  const stopChild = () => child.kill()
  process.on('SIGINT', stopChild)
  process.on('SIGTERM', stopChild)
  const [code] = await once(child, 'exit')
  process.off('SIGINT', stopChild)
  process.off('SIGTERM', stopChild)
  testExit = code ?? 1
} finally {
  try {
    if (baseline !== null) {
      await cleanupTestEmails(client, emails, protectedIds)
      const finalFingerprint = await fingerprintExistingRows(client, protectedIds)
      assert.equal(finalFingerprint, baseline, 'Pre-existing account or starter data changed during integration tests')
      const finalUsers = await client.query('SELECT id FROM cartcheck.users ORDER BY id')
      assert.deepEqual(finalUsers.rows.map((row) => String(row.id)), protectedIds.map(String),
        'The database account set did not return to its original state')
      unlinkSync(manifestPath)
      console.log(`Guarded integration run ${runId}: temporary records removed; pre-existing records unchanged.`)
    }
  } finally {
    await client.end()
  }
}
if (testExit !== 0) process.exitCode = testExit
