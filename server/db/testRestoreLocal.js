// Restores the private CartCheck JSON export into a NEW loopback fixture only.
// Never consumes DATABASE_URL or any production connection configuration.
import assert from 'node:assert/strict'
import { readFile, realpath, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { resolve, relative, isAbsolute, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const privateRoot = await realpath(fileURLToPath(new URL('../.test-runs/backups/', import.meta.url)))
const file = await realpath(resolve(process.argv[2] || ''))
const backupPath = relative(privateRoot, file)
assert.ok(backupPath && !isAbsolute(backupPath) && backupPath !== '..' && !backupPath.startsWith('..' + sep), 'Use an export in the ignored backup directory')
const bytes = await readFile(file)
const backup = JSON.parse(bytes)
assert.equal(backup.format, 'CartCheck private JSON export v1')
assert.equal(backup.scope, 'cartcheck schema')
const order = ['schema_migrations', 'users', 'starter_products', 'products', 'sessions', 'auth_action_tokens', 'auth_email_limits', 'shopping_trips', 'trip_items']
assert.deepEqual(Object.keys(backup.tables).sort(), [...order].sort())
const target = JSON.parse(await readFile(new URL('../.test-runs/local-target.json', import.meta.url)))
assert.equal(target.host, '127.0.0.1')
assert.equal(target.port, 55439)
const database = `cartcheck_restore_test_${randomUUID().replaceAll('-', '')}`
assert.match(database, /^cartcheck_restore_test_[a-f0-9]{32}$/)
const config = (name) => ({ host: '127.0.0.1', port: 55439, user: 'postgres', password: 'local-fixture-only', database: name, ssl: false })
const admin = new pg.Client(config('postgres'))
await admin.connect()
await admin.query(`CREATE DATABASE ${database} TEMPLATE template0 ENCODING 'UTF8'`)
await admin.end()
const db = new pg.Client(config(database))
const ident = (s) => '"' + s.replaceAll('"', '""') + '"'
const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v
await db.connect()
let stage = 'schema'
try {
  await db.query("SET TIME ZONE 'UTC'")
  await db.query('BEGIN')
  await db.query('CREATE SCHEMA cartcheck; CREATE TABLE cartcheck.schema_migrations(filename text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())')
  for (const migration of [...backup.tables.schema_migrations].sort((a, b) => a.filename.localeCompare(b.filename))) {
    assert.match(migration.filename, /^00[1-4]_[\w-]+\.sql$/)
    const sql = await readFile(new URL(`./migrations/${migration.filename}`, import.meta.url), 'utf8')
    assert.equal(createHash('sha256').update(sql).digest('hex'), migration.sha256, 'Export migration checksum must match repository')
    await db.query(sql)
  }
  for (const table of order) {
    stage = table
    for (const row of backup.tables[table]) {
      const columns = Object.keys(row)
      await db.query(`INSERT INTO cartcheck.${ident(table)} (${columns.map(ident).join(',')}) VALUES (${columns.map((_, i) => '$' + (i + 1)).join(',')})`, Object.values(row))
    }
    const actual = (await db.query(`SELECT to_jsonb(t) AS row FROM cartcheck.${ident(table)} t`)).rows.map((r) => JSON.stringify(canonical(r.row))).sort()
    const expected = backup.tables[table].map((r) => JSON.stringify(canonical(r))).sort()
    assert.deepEqual(actual, expected, `Restored ${table} must match every exported value`)
  }
  for (const sequence of backup.metadata.sequences) {
    assert.equal(sequence.schemaname, 'cartcheck')
    const value = sequence.last_value ?? sequence.start_value
    await db.query('SELECT setval($1::regclass,$2,$3)', [`cartcheck.${ident(sequence.sequencename)}`, value, sequence.last_value !== null])
  }
  const invalid = (await db.query("SELECT count(*)::int AS count FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='cartcheck' AND NOT c.convalidated")).rows[0].count
  assert.equal(invalid, 0)
  await db.query('COMMIT')
  const report = { sourceTimestamp: backup.timestamp, sha256: createHash('sha256').update(bytes).digest('hex'), database, productionWrites: false, tableCounts: Object.fromEntries(order.map((t) => [t, backup.tables[t].length])), allRowsEqual: true, validatedConstraints: true, sequencesRestored: true, scope: 'Application schema/data only; provider roles, grants, extensions and infrastructure are not restored' }
  await writeFile(new URL('../.test-runs/restore-result.json', import.meta.url), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  await db.query('ROLLBACK').catch(() => {})
  console.error('Isolated restore failed at ' + stage + '; private contents suppressed. Code: ' + (error.code || 'VERIFICATION_FAILED'))
  process.exitCode = 1
} finally { await db.end() }
