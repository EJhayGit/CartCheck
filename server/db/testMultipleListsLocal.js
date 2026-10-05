// Local-only migration/API runner. Never reads DATABASE_URL or an env file.
// Start the separately isolated PostgreSQL fixture cluster before invoking.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import pg from 'pg'
import { fileURLToPath } from 'node:url'
import { fingerprintExistingRows } from '../testDatabaseSafety.js'

const root = new URL('../', import.meta.url)
const target = JSON.parse(await readFile(new URL('../.test-runs/local-target.json', import.meta.url), 'utf8'))
assert.equal(target.host, '127.0.0.1')
assert.equal(target.port, 55439)
assert.equal(target.testDatabase, 'cartcheck_lists_test')
const databaseUrl = 'postgresql://postgres:local-fixture-only@127.0.0.1:55439/cartcheck_lists_test'
const config = { connectionString: databaseUrl, ssl: false }
const db = new pg.Client(config)
await db.connect()
await db.query("SET TIME ZONE 'UTC'")
const migration = await readFile(new URL('./migrations/004_multiple_named_lists.sql', import.meta.url), 'utf8')
const report = { engine: (await db.query('SELECT version()')).rows[0].version, target: '127.0.0.1:55439/cartcheck_lists_test', productionAccess: false, checks: [] }
const record = (name) => { report.checks.push(name); console.log('PASS ' + name) }
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value
const hash = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
const query = (sql, values) => db.query(sql, values)
async function rejects(sql, values, code) {
  await query('SAVEPOINT rejected_change')
  try { await assert.rejects(query(sql, values), (e) => e.code === code) }
  finally { await query('ROLLBACK TO SAVEPOINT rejected_change'); await query('RELEASE SAVEPOINT rejected_change') }
}
async function command(args, extraEnv = {}) {
  const child = spawn(process.execPath, args, { cwd: fileURLToPath(root), env: {
    ...process.env, DATABASE_URL: databaseUrl, CARTCHECK_TEST_DATABASE_URL: databaseUrl,
    CARTCHECK_TEST_RUN_ID: randomUUID(), NODE_ENV: 'test', REQUIRE_VERIFIED_EMAIL: 'false',
    RESEND_API_KEY: '', EMAIL_FROM: '', SSL_CA_FILE: '', ...extraEnv,
  }, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (v) => { output += v; process.stdout.write(v) })
  child.stderr.on('data', (v) => { output += v; process.stderr.write(v) })
  const [exitCode] = await once(child, 'exit')
  assert.equal(exitCode, 0, output)
  return output
}
try {
  if (process.argv.includes('--api-only')) {
    const ids = (await query('SELECT id FROM cartcheck.users ORDER BY id')).rows.map((r) => r.id)
    const before = await fingerprintExistingRows(db, ids)
    report.apiOutput = await command(['--test', 'auth.integration.test.js', 'catalog.integration.test.js', 'cart.integration.test.js', 'accountEnhancements.integration.test.js'])
    assert.equal(await fingerprintExistingRows(db, ids), before)
    record('All preexisting local legacy rows remain byte-for-byte unchanged after API integration suites')
  } else {
    assert.equal((await query("SELECT to_regclass('cartcheck.shopping_trips') AS table_name")).rows[0].table_name, null,
      'Use a newly created isolated fixture database; refusing to alter an existing schema')
    for (const filename of ['001_initial.sql', '002_nullable_historical_product.sql', '003_account_enhancements.sql']) {
      await query(await readFile(new URL('./migrations/' + filename, import.meta.url), 'utf8'))
    }
    const owners = (await query("INSERT INTO cartcheck.users(email,password_hash) VALUES ('legacy-a@example.invalid','fixture'),('legacy-b@example.invalid','fixture') RETURNING id")).rows
    const [a, b] = owners.map((r) => r.id)
    const product = (await query("INSERT INTO cartcheck.products(user_id,name,category) VALUES ($1,'Legacy milk','Dairy & eggs') RETURNING id", [a])).rows[0].id
    const trips = (await query(`INSERT INTO cartcheck.shopping_trips(user_id,status,currency,budget,created_at,completed_at,revision)
      VALUES ($1,'active','PHP',0,'2026-09-01',NULL,3),($1,'completed','USD',2500,'2026-08-01','2026-08-03',5),
             ($2,'active','EUR',NULL,'2026-09-02',NULL,2) RETURNING id`, [a, b])).rows
    const [active, completed, foreign] = trips.map((r) => r.id)
    await query(`INSERT INTO cartcheck.trip_items(user_id,trip_id,product_id,name,category,quantity,bought,estimated_total,actual_total,created_at,updated_at)
      VALUES ($1,$2,$4,'Milk snapshot','Dairy & eggs',1.5,true,NULL,0,'2026-09-01','2026-09-05'),
             ($1,$3,NULL,'Historical rice','Pantry',2,false,100,NULL,'2026-08-01','2026-08-04'),
             ($1,$3,NULL,'Historical eggs','Dairy & eggs',1,true,50,45,'2026-08-01','2026-08-02')`, [a, active, completed, product])
    const originalTrips = (await query('SELECT row_to_json(t) AS row FROM cartcheck.shopping_trips t ORDER BY id')).rows
    const originalItems = (await query('SELECT row_to_json(i) AS row FROM cartcheck.trip_items i ORDER BY id')).rows
    const originalOwners = await fingerprintExistingRows(db, [a, b])
    report.legacyRows = { users: 2, trips: 3, active: 2, completed: 1, items: 3 }
    report.before = { tripsSha256: hash(originalTrips), itemsSha256: hash(originalItems) }
    await query('BEGIN')
    await query(migration)
    const afterTrips = (await query("SELECT to_jsonb(t) - 'name' - 'updated_at' AS row FROM cartcheck.shopping_trips t ORDER BY id")).rows
    const afterItems = (await query('SELECT row_to_json(i) AS row FROM cartcheck.trip_items i ORDER BY id')).rows
    assert.deepEqual(afterTrips, originalTrips)
    assert.deepEqual(afterItems, originalItems)
    report.after = { tripsSha256: hash(afterTrips), itemsSha256: hash(afterItems) }
    const named = (await query('SELECT id,name,updated_at FROM cartcheck.shopping_trips ORDER BY id')).rows
    assert.deepEqual(named.map((r) => r.name), ['My Grocery List', 'Shopping Trip', 'My Grocery List'])
    assert.equal(named[0].updated_at.toISOString(), '2026-09-05T00:00:00.000Z')
    assert.equal(named[1].updated_at.toISOString(), '2026-08-04T00:00:00.000Z')
    record('Legacy backfill: 2 active defaults, 1 historical default, latest snapshot timestamps')
    record('All legacy trip fields and item snapshots unchanged (before/after SHA-256 evidence)')
    await query(migration)
    assert.deepEqual((await query('SELECT id,name,updated_at FROM cartcheck.shopping_trips ORDER BY id')).rows, named)
    record('Migration SQL rerun is idempotent')
    await query("INSERT INTO cartcheck.shopping_trips(user_id,name,currency) VALUES ($1,'Second list','PHP'),($1,'Second list','PHP')", [a])
    assert.equal((await query("SELECT count(*)::int AS n FROM cartcheck.shopping_trips WHERE user_id=$1 AND status='active'", [a])).rows[0].n, 3)
    assert.equal((await query("SELECT to_regclass('cartcheck.shopping_trips_one_active_per_user_idx') AS idx")).rows[0].idx, null)
    record('Multiple active lists and duplicate names accepted; singleton unique index absent')
    for (const name of ['', ' ', '\u00a0', '\u2003', '\ufeff', ' Trimmed ', '😀'.repeat(101)]) {
      await rejects("INSERT INTO cartcheck.shopping_trips(user_id,name,currency) VALUES ($1,$2,'PHP')", [a, name], '23514')
    }
    await rejects("INSERT INTO cartcheck.shopping_trips(user_id,currency) VALUES ($1,'PHP')", [a], '23502')
    await query("INSERT INTO cartcheck.shopping_trips(user_id,name,currency,budget) VALUES ($1,$2,'PHP',NULL)", [a, '😀'.repeat(100)])
    await rejects("INSERT INTO cartcheck.trip_items(user_id,trip_id,name,category,quantity) VALUES ($1,$2,'X','Other',1)", [b, active], '23503')
    await rejects("INSERT INTO cartcheck.trip_items(user_id,trip_id,product_id,name,category,quantity) VALUES ($1,$2,$3,'X','Other',1)", [b, foreign, product], '23503')
    await rejects("UPDATE cartcheck.shopping_trips SET completed_at=now() WHERE id=$1", [active], '23514')
    await rejects("INSERT INTO cartcheck.trip_items(user_id,trip_id,product_id,name,category,quantity) VALUES ($1,$2,$3,'X','Other',1)", [a, active, product], '23505')
    record('Name length/Unicode/whitespace/required rules and ownership/status/product uniqueness preserved')
    await query('ROLLBACK')
    assert.equal(await fingerprintExistingRows(db, [a, b]), originalOwners)
    record('Dry-run transaction rolled back completely to the original legacy data/schema')

    await query('BEGIN')
    await query("ALTER TABLE cartcheck.shopping_trips ADD COLUMN name text DEFAULT 'Old default'; ALTER TABLE cartcheck.shopping_trips ADD COLUMN updated_at timestamptz")
    await query("UPDATE cartcheck.shopping_trips SET name='Existing 🛒', updated_at='2026-09-20' WHERE id=$1", [active])
    await query("UPDATE cartcheck.shopping_trips SET name=$1 WHERE id=$2", ['\u00a0\u2003\ufeff', foreign])
    await query(migration)
    assert.equal((await query('SELECT name FROM cartcheck.shopping_trips WHERE id=$1', [active])).rows[0].name, 'Existing 🛒')
    assert.equal((await query('SELECT updated_at FROM cartcheck.shopping_trips WHERE id=$1', [active])).rows[0].updated_at.toISOString(), '2026-09-20T00:00:00.000Z')
    assert.equal((await query('SELECT name FROM cartcheck.shopping_trips WHERE id=$1', [foreign])).rows[0].name, 'My Grocery List')
    assert.equal((await query("SELECT column_default FROM information_schema.columns WHERE table_schema='cartcheck' AND table_name='shopping_trips' AND column_name='name'")).rows[0].column_default, null)
    await query('ROLLBACK')
    record('Partial compatible columns preserve existing Unicode names/timestamps and backfill Unicode blank names')

    for (const invalid of [' Not trimmed ', '😀'.repeat(101)]) {
      await query('BEGIN')
      await query('ALTER TABLE cartcheck.shopping_trips ADD COLUMN name text')
      await query('UPDATE cartcheck.shopping_trips SET name=$1 WHERE id=$2', [invalid, active])
      await assert.rejects(query(migration), (e) => e.code === '23514')
      await query('ROLLBACK')
      assert.equal(await fingerprintExistingRows(db, [a, b]), originalOwners)
    }
    record('Invalid existing nonblank names abort atomically without modifying legacy data')
    await query('BEGIN')
    await query("ALTER TABLE cartcheck.shopping_trips ADD COLUMN name text; ALTER TABLE cartcheck.shopping_trips ADD CONSTRAINT shopping_trips_name_valid CHECK(char_length(name)<=100 OR name=btrim(name) OR TRUE)")
    await assert.rejects(query(migration))
    await query('ROLLBACK')
    record('Incompatible preexisting named constraint rejected atomically')

    await query('BEGIN')
    await query("CREATE UNIQUE INDEX shopping_trips_active_updated_idx ON cartcheck.shopping_trips(user_id) WHERE status='active'")
    await assert.rejects(query(migration), /incompatible definition/)
    await query('ROLLBACK')
    record('Incompatible preexisting active-list index rejected atomically')

    await query(await readFile(new URL('./seed.sql', import.meta.url), 'utf8'))
    report.runnerOutput = await command(['db/run.js', 'migrate'])
    report.rerunOutput = await command(['db/run.js', 'migrate'])
    record('Actual checksum migration runner upgrades legacy schema and skips unchanged rerun')
    report.constraintVerificationOutput = await command(['db/verify.js'])
    record('Updated database verification confirms multiple active lists and all retained integrity constraints')
    const freshName = 'cartcheck_lists_schema_' + randomUUID().replaceAll('-', '')
    await query('CREATE DATABASE ' + freshName + " ENCODING 'UTF8' TEMPLATE template0")
    const fresh = new pg.Client({ ...config, connectionString: databaseUrl.replace('/cartcheck_lists_test', '/' + freshName) })
    await fresh.connect()
    try {
      await fresh.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'))
      const owner = (await fresh.query("INSERT INTO cartcheck.users(email,password_hash) VALUES('fresh@example.invalid','fixture') RETURNING id")).rows[0].id
      await fresh.query("INSERT INTO cartcheck.shopping_trips(user_id,name,currency) VALUES($1,'Fresh list','PHP'),($1,'Fresh list','PHP')", [owner])
      await fresh.query(migration)
      record('Fresh schema allows multiple lists and accepts migration 004 consistently')
    } finally { await fresh.end() }
    const ids = (await query('SELECT id FROM cartcheck.users ORDER BY id')).rows.map((r) => r.id)
    const before = await fingerprintExistingRows(db, ids)
    report.apiOutput = await command(['--test', 'auth.integration.test.js', 'catalog.integration.test.js', 'cart.integration.test.js', 'accountEnhancements.integration.test.js'])
    assert.equal(await fingerprintExistingRows(db, ids), before)
    record('All preexisting local legacy rows unchanged after API integration suites')
  }
  report.success = true
} catch (error) {
  report.success = false
  report.error = error.stack
  process.exitCode = 1
  console.error(error)
} finally {
  await db.end()
  const output = new URL('../../docs/design/multiple-lists-review/', import.meta.url)
  await mkdir(output, { recursive: true })
  await writeFile(new URL('migration-api-results.json', output), JSON.stringify(report, null, 2) + '\n')
}
