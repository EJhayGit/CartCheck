// Guard a browser walkthrough with one uniquely identified temporary account.
// node --env-file=.env browserTestGuard.js --prepare
// node --env-file=.env browserTestGuard.js --inspect|--cleanup <run-id>
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { poolConfig } from './db/config.js'
import { approvedTestTarget, cleanupTestEmails, fingerprintExistingRows } from './testDatabaseSafety.js'

const [mode, requestedId] = process.argv.slice(2)
assert.ok(['--prepare', '--inspect', '--cleanup'].includes(mode), 'Specify --prepare, --inspect, or --cleanup')
const runId = mode === '--prepare' ? randomUUID() : requestedId
assert.match(runId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
const email = `m7-browser-${runId}@example.test`
const directory = join(dirname(fileURLToPath(import.meta.url)), '.test-runs')
const manifestPath = join(directory, `browser-${runId}.json`)
const target = approvedTestTarget(process.env.DATABASE_URL, process.env.CARTCHECK_TEST_PROJECT_REF, process.env.NODE_ENV)
if (mode === '--prepare') assert.ok(!existsSync(directory) || readdirSync(directory).length === 0,
  'A previous test manifest remains; inspect and clean it before starting another')
const client = new pg.Client(poolConfig(process.env))

try {
  await client.connect()
  assert.equal(client.connection.stream.encrypted, true)
  const identity = await client.query('SELECT current_database() AS database, current_user AS role')
  assert.equal(identity.rows[0].database, 'postgres')
  if (mode === '--prepare') {
    const absent = await client.query('SELECT id FROM cartcheck.users WHERE email = $1', [email])
    assert.equal(absent.rowCount, 0)
    const existing = await client.query('SELECT id FROM cartcheck.users ORDER BY id')
    const protectedIds = existing.rows.map((row) => String(row.id))
    const baseline = await fingerprintExistingRows(client, protectedIds)
    mkdirSync(directory, { recursive: true })
    writeFileSync(manifestPath, JSON.stringify({ runId, email, protectedIds, baseline,
      host: target.hostname, database: identity.rows[0].database, role: identity.rows[0].role }, null, 2),
    { flag: 'wx', mode: 0o600 })
    console.log({ runId, email, protectedAccounts: protectedIds.length, baselineRecorded: true })
  } else {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    assert.equal(manifest.runId, runId)
    assert.equal(manifest.email, email)
    assert.equal(manifest.host, target.hostname)
    assert.equal(manifest.database, identity.rows[0].database)
    assert.equal(manifest.role, identity.rows[0].role)
    const protectedIds = manifest.protectedIds
    assert.equal(await fingerprintExistingRows(client, protectedIds), manifest.baseline,
      'Pre-existing account or starter rows changed during the browser walkthrough')
    const testAccount = await client.query('SELECT id, created_at FROM cartcheck.users WHERE email = $1', [email])
    assert.ok(testAccount.rowCount <= 1)
    const id = testAccount.rows[0]?.id
    if (id !== undefined) {
      assert.ok(!protectedIds.includes(String(id)))
      assert.ok(new Date(testAccount.rows[0].created_at).getTime() >= statSync(manifestPath).mtimeMs - 60_000)
    }
    const dependent = {}
    for (const table of ['sessions', 'products', 'shopping_trips', 'trip_items']) {
      const result = await client.query(
        `SELECT count(*)::int AS count FROM cartcheck.${table} WHERE user_id = $1`, [id ?? null]
      )
      dependent[table] = result.rows[0].count
    }
    console.log({ runId, mode, temporaryAccount: Boolean(id), dependent, protectedBaselineMatches: true })
    if (mode === '--cleanup') {
      await cleanupTestEmails(client, [email], protectedIds)
      assert.equal(await fingerprintExistingRows(client, protectedIds), manifest.baseline)
      const users = await client.query('SELECT id FROM cartcheck.users ORDER BY id')
      assert.deepEqual(users.rows.map((row) => String(row.id)), protectedIds)
      unlinkSync(manifestPath)
      console.log(`Browser run ${runId}: exact temporary data removed; protected baseline unchanged.`)
    }
  }
} finally { await client.end() }
