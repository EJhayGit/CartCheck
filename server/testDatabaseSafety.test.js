import assert from 'node:assert/strict'
import test from 'node:test'
import { approvedTestTarget, assertUnusedTestEmails, cleanupTestEmails, testEmails } from './testDatabaseSafety.js'

const runId = '9f4d76d0-6ea3-4772-9242-7c21d590bd2f'

test('guarded tests require the approved Supabase project identity', () => {
  const ref = 'abcdefghijklmnopqrst'
  const url = `postgresql://postgres.${ref}:placeholder@aws-0.pooler.supabase.com:5432/postgres`
  assert.equal(approvedTestTarget(url, ref, 'development').username, `postgres.${ref}`)
  assert.throws(() => approvedTestTarget(url, undefined, 'development'), /PROJECT_REF/)
  assert.throws(() => approvedTestTarget(url, 'zyxwvutsrqponmlkjihg', 'development'), /approved development project/)
  assert.throws(() => approvedTestTarget(url, ref, 'production'), /production mode/)
  const otherDatabase = new URL(url)
  otherDatabase.pathname = '/other'
  assert.throws(() => approvedTestTarget(otherDatabase.href, ref, 'development'), /database name/)
})

test('run marker produces eight distinct temporary identities', () => {
  const emails = testEmails(runId)
  assert.equal(new Set(emails).size, 8)
  assert.ok(emails.every((email) => email.endsWith(`${runId}@example.test`)))
  assert.throws(() => testEmails('not-a-uuid'))
})

test('preflight refuses an existing temporary email', async () => {
  await assert.rejects(assertUnusedTestEmails({ query: async () => ({ rowCount: 1 }) }, [testEmails(runId)[0]]),
    /already exist/)
})

test('cleanup refuses to delete an account present before the run', async () => {
  const commands = []
  const email = testEmails(runId)[0]
  const client = { async query(sql) {
    commands.push(sql)
    if (sql.includes('FOR UPDATE')) return { rows: [{ id: '17', email }] }
    return { rows: [] }
  } }
  await assert.rejects(cleanupTestEmails(client, [email], ['17']), /existed before/)
  assert.equal(commands[0], 'BEGIN')
  assert.equal(commands.at(-1), 'ROLLBACK')
  assert.equal(commands.some((sql) => sql.includes('DELETE FROM cartcheck.users')), false)
})

test('cleanup deletes only verified temporary IDs and their items in FK-safe order', async () => {
  const email = testEmails(runId)[0]
  const calls = []
  const client = { async query(sql, params) {
    calls.push({ sql, params })
    if (sql.includes('FOR UPDATE')) return { rows: [{ id: '87', email }] }
    if (sql.includes('DELETE FROM cartcheck.users')) return { rowCount: 1 }
    if (sql.includes('count(*)::int')) return { rows: [{ count: 0 }] }
    return { rows: [] }
  } }
  await cleanupTestEmails(client, [email], ['61'])
  const items = calls.findIndex(({ sql }) => sql.includes('DELETE FROM cartcheck.trip_items'))
  const users = calls.findIndex(({ sql }) => sql.includes('DELETE FROM cartcheck.users'))
  assert.ok(items >= 0 && users > items)
  assert.deepEqual(calls[items].params, [['87']])
  assert.deepEqual(calls[users].params, [['87'], [email]])
  assert.equal(calls.at(-1).sql, 'COMMIT')
})
