import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PREFIXES = ['m2-a', 'm2-b', 'm3-a', 'm3-b', 'm4-a', 'm4-b']

export function approvedTestTarget(databaseUrl, projectRef, nodeEnv) {
  assert.ok(databaseUrl, 'Configured development DATABASE_URL is required')
  assert.notEqual(nodeEnv, 'production', 'Refusing to run tests in production mode')
  assert.match(projectRef ?? '', /^[a-z0-9]{20}$/, 'Set CARTCHECK_TEST_PROJECT_REF to the approved development project ref')
  const target = new URL(databaseUrl)
  assert.match(target.hostname, /\.pooler\.supabase\.com$/, 'Only a Supabase pooler is accepted')
  assert.equal(target.pathname, '/postgres', 'Unexpected database name')
  assert.equal(decodeURIComponent(target.username), `postgres.${projectRef}`,
    'DATABASE_URL does not identify the approved development project')
  return target
}

export function testEmails(runId) {
  assert.match(runId, RUN_ID, 'CARTCHECK_TEST_RUN_ID must be a UUID')
  return PREFIXES.map((prefix) => `${prefix}-${runId}@example.test`)
}

export async function assertUnusedTestEmails(client, emails) {
  const existing = await client.query('SELECT id FROM cartcheck.users WHERE email = ANY($1::text[])', [emails])
  assert.equal(existing.rowCount, 0, 'Refusing to use a run ID whose temporary emails already exist')
}

export async function cleanupTestEmails(client, emails, protectedIds = []) {
  assert.ok(emails.length > 0 && emails.every((email) => /^(?:m[234]-[ab]|m7-browser)-[0-9a-f-]+@example\.test$/i.test(email)))
  await client.query('BEGIN')
  try {
    const candidates = await client.query(
      'SELECT id, email FROM cartcheck.users WHERE email = ANY($1::text[]) FOR UPDATE', [emails]
    )
    assert.ok(candidates.rows.every((row) => emails.includes(row.email)), 'Cleanup found an unexpected account')
    const ids = candidates.rows.map((row) => row.id)
    assert.ok(ids.every((id) => !protectedIds.some((protectedId) => String(protectedId) === String(id))),
      'Cleanup would touch an account that existed before this test run')
    if (ids.length) {
      // The product FK restricts deletion while an active cart item still refers to it.
      // Delete only items owned by these verified temporary account IDs first.
      await client.query('DELETE FROM cartcheck.trip_items WHERE user_id = ANY($1::bigint[])', [ids])
      const deleted = await client.query(
        `DELETE FROM cartcheck.users
         WHERE id = ANY($1::bigint[]) AND email = ANY($2::text[])
         RETURNING id`,
        [ids, emails]
      )
      assert.equal(deleted.rowCount, ids.length, 'Cleanup did not remove exactly the temporary accounts')
      for (const table of ['sessions', 'products', 'shopping_trips', 'trip_items']) {
        const remaining = await client.query(
          `SELECT count(*)::int AS count FROM cartcheck.${table} WHERE user_id = ANY($1::bigint[])`, [ids]
        )
        assert.equal(remaining.rows[0].count, 0, `Temporary ${table} remain after account cleanup`)
      }
    }
    const remaining = await client.query('SELECT count(*)::int AS count FROM cartcheck.users WHERE email = ANY($1::text[])', [emails])
    assert.equal(remaining.rows[0].count, 0, 'Temporary accounts remain after cleanup')
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  }
}

export async function fingerprintExistingRows(client, existingUserIds) {
  const hash = createHash('sha256')
  const tables = [
    ['users', 'id'], ['sessions', 'id'], ['products', 'id'],
    ['shopping_trips', 'id'], ['trip_items', 'id'],
  ]
  for (const [table, order] of tables) {
    const owner = table === 'users' ? 'id' : 'user_id'
    const result = await client.query(
      `SELECT row_to_json(t) AS value FROM cartcheck.${table} t
       WHERE ${owner} = ANY($1::bigint[]) ORDER BY ${order}`,
      [existingUserIds]
    )
    hash.update(table)
    hash.update(JSON.stringify(result.rows.map((row) => row.value)))
  }
  const starters = await client.query('SELECT row_to_json(s) AS value FROM cartcheck.starter_products s ORDER BY code')
  hash.update('starter_products')
  hash.update(JSON.stringify(starters.rows.map((row) => row.value)))
  return hash.digest('hex')
}
