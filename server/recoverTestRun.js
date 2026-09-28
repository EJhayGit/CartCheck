// Inspect first. Cleanup is limited to identities in an ignored recovery manifest.
// node --env-file=.env recoverTestRun.js <run-id> --inspect|--cleanup
import assert from 'node:assert/strict'
import { readFileSync, statSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { poolConfig } from './db/config.js'
import { approvedTestTarget, cleanupTestEmails, fingerprintExistingRows, testEmails } from './testDatabaseSafety.js'

const [runId, mode] = process.argv.slice(2)
assert.ok(mode === '--inspect' || mode === '--cleanup', 'Specify --inspect or --cleanup')
const emails = testEmails(runId)
const manifestPath = join(dirname(fileURLToPath(import.meta.url)), '.test-runs', `${runId}.json`)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
assert.equal(manifest.runId, runId)
assert.deepEqual(manifest.emails, emails)
const target = approvedTestTarget(process.env.DATABASE_URL, process.env.CARTCHECK_TEST_PROJECT_REF, process.env.NODE_ENV)
assert.equal(target.hostname, manifest.host)
assert.equal(target.pathname.slice(1), manifest.database)
const client = new pg.Client(poolConfig(process.env))

try {
  await client.connect()
  assert.equal(client.connection.stream.encrypted, true)
  const identity = await client.query('SELECT current_database() AS database, current_user AS role')
  assert.equal(identity.rows[0].database, manifest.database)
  assert.equal(identity.rows[0].role, manifest.role)
  const protectedIds = manifest.protectedIds
  const baseline = await fingerprintExistingRows(client, protectedIds)
  assert.equal(baseline, manifest.baseline, 'Protected rows differ from the recorded pre-test baseline')
  const rows = await client.query(
    `SELECT id, email, created_at FROM cartcheck.users
     WHERE email = ANY($1::text[]) ORDER BY id`, [emails]
  )
  const earliest = statSync(manifestPath).mtimeMs - 60_000
  assert.ok(rows.rows.every((row) => emails.includes(row.email) &&
    !protectedIds.includes(String(row.id)) && new Date(row.created_at).getTime() >= earliest),
  'Candidate cleanup accounts do not match the run manifest and creation window')
  const ids = rows.rows.map((row) => row.id)
  const counts = {}
  for (const table of ['sessions', 'products', 'shopping_trips', 'trip_items']) {
    const count = await client.query(
      `SELECT count(*)::int AS count FROM cartcheck.${table} WHERE user_id = ANY($1::bigint[])`, [ids]
    )
    counts[table] = count.rows[0].count
  }
  console.log({ runId, mode, temporaryAccounts: rows.rowCount, dependentRows: counts,
    protectedAccounts: protectedIds.length, protectedFingerprintMatches: true })
  if (mode === '--cleanup') {
    await cleanupTestEmails(client, emails, protectedIds)
    assert.equal(await fingerprintExistingRows(client, protectedIds), manifest.baseline)
    const users = await client.query('SELECT id FROM cartcheck.users ORDER BY id')
    assert.deepEqual(users.rows.map((row) => String(row.id)), protectedIds,
      'Account IDs did not return to the pre-test set')
    unlinkSync(manifestPath)
    console.log(`Run ${runId}: exact temporary records removed; protected baseline unchanged.`)
  }
} finally { await client.end() }
