// Local-only starter catalog migration and backfill dry-run.
// Requires the isolated embedded PostgreSQL cluster from startMultipleListsLocal.js.
// Never reads DATABASE_URL or any environment-based connection configuration.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { listCatalog } from '../catalogRepo.js'

const here = (name) => new URL(name, import.meta.url)
const target = JSON.parse(await readFile(here('../.test-runs/local-target.json'), 'utf8'))
assert.equal(target.host, '127.0.0.1', 'fixture must be bound to loopback')
assert.equal(target.port, 55439, 'fixture must use its dedicated local port')

const database = `cartcheck_catalog_test_${randomUUID().replaceAll('-', '')}`
assert.match(database, /^cartcheck_catalog_test_[a-f0-9]{32}$/)
const connectionString = `postgresql://postgres:local-fixture-only@127.0.0.1:55439/${database}`
const admin = new pg.Client({ connectionString: 'postgresql://postgres:local-fixture-only@127.0.0.1:55439/postgres', ssl: false })
await admin.connect()
await admin.query(`CREATE DATABASE ${database} ENCODING 'UTF8' TEMPLATE template0`)
await admin.end()

const db = new pg.Client({ connectionString, ssl: false })
await db.connect()
await db.query("SET TIME ZONE 'UTC'")
const record = (message) => console.log(`PASS ${message}`)
const read = (name) => readFile(here(name), 'utf8')
const fingerprint = async (table, order) => (await db.query(`SELECT row_to_json(r) AS row FROM cartcheck.${table} r ORDER BY ${order}`)).rows

function parseSeed(sql) {
  const values = sql.match(/INSERT INTO cartcheck\.starter_products[\s\S]*?VALUES([\s\S]*?)ON CONFLICT/s)?.[1]
  assert.ok(values, 'seed must contain a starter_products VALUES list')
  return [...values.matchAll(/\('((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)'\)/g)]
    .map((row) => row.slice(1, 4).map((value) => value.replaceAll("''", "'")))
}

function parseBackfill(sql) {
  const values = sql.match(/WHERE s\.code IN\s*\(([\s\S]*?)\)\s*ON CONFLICT/i)?.[1]
  assert.ok(values, 'backfill must contain an explicit starter-code allowlist')
  return [...values.matchAll(/'((?:[^']|'')*)'/g)].map((row) => row[1].replaceAll("''", "'"))
}

async function snapshot() {
  return {
    starters: await fingerprint('starter_products', 'code'),
    users: await fingerprint('users', 'id'),
    products: await fingerprint('products', 'id'),
    trips: await fingerprint('shopping_trips', 'id'),
    items: await fingerprint('trip_items', 'id'),
  }
}

try {
  const migrations = ['001_initial.sql', '002_nullable_historical_product.sql', '003_account_enhancements.sql', '004_multiple_named_lists.sql']
  await db.query('CREATE SCHEMA IF NOT EXISTS cartcheck')
  await db.query(`CREATE TABLE IF NOT EXISTS cartcheck.schema_migrations (
    filename text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
  )`)
  for (const filename of migrations) {
    const sql = await read(`./migrations/${filename}`)
    const sha256 = createHash('sha256').update(sql).digest('hex')
    await db.query('BEGIN')
    try {
      const applied = await db.query('SELECT sha256 FROM cartcheck.schema_migrations WHERE filename=$1', [filename])
      if (applied.rowCount) assert.equal(applied.rows[0].sha256, sha256, `migration checksum mismatch: ${filename}`)
      else {
        await db.query(sql)
        await db.query('INSERT INTO cartcheck.schema_migrations(filename,sha256) VALUES($1,$2)', [filename, sha256])
      }
      await db.query('COMMIT')
    } catch (error) {
      await db.query('ROLLBACK')
      throw error
    }
  }
  assert.deepEqual((await db.query('SELECT filename FROM cartcheck.schema_migrations ORDER BY filename')).rows.map((row) => row.filename), migrations)
  record('Applied migrations 001–004 unchanged and recorded matching SHA-256 checksums')

  const seedSql = await read('./seed.sql')
  const backfillSql = await read('./backfill-starters.sql')
  const starters = parseSeed(seedSql)
  const starterCodes = starters.map(([code]) => code)
  assert.equal(starters.length, 160)
  assert.equal(new Set(starterCodes).size, 160, 'starter codes must be unique')
  assert.equal(new Set(starters.map(([, name]) => name.toLocaleLowerCase())).size, 160, 'starter names must be unique')
  for (const [code, name, category] of starters) {
    assert.ok(code && name.trim() && category.trim(), 'starter tuple fields must be nonempty')
    assert.ok(['Produce', 'Dairy & eggs', 'Meat & seafood', 'Bakery', 'Pantry', 'Frozen', 'Snacks', 'Beverages', 'Household'].includes(category), `unexpected category for ${code}: ${category}`)
  }
  const originalHash = createHash('sha256').update(starters.slice(0, 108).map((row) => row.join('|')).join('\n')).digest('hex')
  assert.equal(originalHash, 'ef2df64303522bae93f4480e60f3fa748aaa73d54973a7b571d562b6b1b7673f', 'baseline 108 catalog tuples changed')
  const backfillCodes = parseBackfill(backfillSql)
  assert.equal(backfillCodes.length, 52)
  assert.equal(new Set(backfillCodes).size, 52, 'backfill codes must be unique')
  assert.deepEqual(new Set(backfillCodes), new Set(starterCodes.slice(108)), 'allowlist must exactly match added starter templates')
  record('Parsed 160 unique nonempty starter tuples; baseline 108 and exact 52-code backfill allowlist validated')

  // Build the pre-upgrade catalog from the original 108 parsed tuples only.
  const baselineStarters = starters.slice(0, 108)
  const baselineParams = baselineStarters.flat()
  const baselineValues = baselineStarters.map((_, row) => {
    const offset = row * 3
    return `($${offset + 1},$${offset + 2},$${offset + 3})`
  }).join(',')
  await db.query(`INSERT INTO cartcheck.starter_products(code,name,category) VALUES ${baselineValues}`, baselineParams)
  assert.equal((await db.query('SELECT count(*)::int AS n FROM cartcheck.starter_products')).rows[0].n, 108)
  const users = (await db.query(`INSERT INTO cartcheck.users(email,password_hash) VALUES
    ('catalog-a@example.invalid','fixture'),('catalog-b@example.invalid','fixture'),
    ('catalog-c@example.invalid','fixture'),('catalog-d@example.invalid','fixture'),
    ('catalog-e@example.invalid','fixture'),('catalog-f@example.invalid','fixture'),
    ('catalog-g@example.invalid','fixture') RETURNING id`)).rows.map((row) => row.id)
  assert.equal(users.length, 7)
  await db.query(`INSERT INTO cartcheck.products(user_id,source_starter_code,name,category)
    SELECT u.id,s.code,s.name,s.category FROM cartcheck.users u
    CROSS JOIN cartcheck.starter_products s`)
  assert.deepEqual((await db.query(`SELECT user_id,count(*)::int AS n FROM cartcheck.products
    WHERE source_starter_code IS NOT NULL GROUP BY user_id ORDER BY user_id`)).rows.map((row) => row.n), Array(7).fill(108))
  const customized = await db.query(`UPDATE cartcheck.products SET name='My apples', category='Other'
    WHERE user_id=$1 AND source_starter_code='produce-apples' RETURNING id`, [users[0]])
  assert.equal(customized.rowCount, 1)
  const custom = (await db.query(`INSERT INTO cartcheck.products(user_id,name,category)
    VALUES($1,'Private flour','Other') RETURNING id`, [users[0]])).rows[0].id
  const trips = (await db.query(`INSERT INTO cartcheck.shopping_trips(user_id,status,currency,budget,created_at,completed_at,name,updated_at)
    VALUES($1,'active','PHP',1000,'2026-10-01',NULL,'Current list','2026-10-02'),
          ($1,'completed','USD',250,'2026-09-01','2026-09-02','Past list','2026-09-03') RETURNING id`, [users[0]])).rows
  const activeTrip = trips[0].id
  const completedTrip = trips[1].id
  await db.query(`INSERT INTO cartcheck.trip_items(user_id,trip_id,product_id,name,category,quantity,bought,estimated_total,actual_total,created_at,updated_at)
    VALUES($1,$2,$3,'My apples','Other',2,false,50,NULL,'2026-10-01','2026-10-02'),
          ($1,$2,$4,'Private flour','Other',1,true,NULL,30,'2026-10-01','2026-10-02'),
          ($1,$5,$3,'Apples snapshot','Produce',1,true,20,18,'2026-09-01','2026-09-02')`, [users[0], activeTrip, customized.rows[0].id, custom, completedTrip])
  const before = await snapshot()
  const baselineProducts = before.products
  assert.equal(baselineProducts.length, 7 * 108 + 1)
  record('Created a shared catalog of 108 starters and seven users with 108 copies each, plus customized/custom products and active/completed trip snapshots')

  await db.query(seedSql)
  await db.query(backfillSql)
  const counts = await db.query(`SELECT
    (SELECT count(*)::int FROM cartcheck.starter_products) AS starters,
    (SELECT count(*)::int FROM cartcheck.products WHERE source_starter_code IS NOT NULL) AS copies,
    (SELECT count(*)::int FROM cartcheck.products) AS products`)
  assert.deepEqual(counts.rows[0], { starters: 160, copies: 1120, products: 1121 })
  const after = await snapshot()
  const baselineCodes = new Set(baselineStarters.map(([code]) => code))
  assert.deepEqual(after.starters.filter(({ row }) => baselineCodes.has(row.code)), before.starters,
    'seed changed an existing shared starter row')
  assert.deepEqual(after.starters.map(({ row }) => [row.code, row.name, row.category]), [...starters].sort(([a], [b]) => a.localeCompare(b)),
    'seed result must exactly match the parsed catalog tuples')
  assert.deepEqual(after.users, before.users, 'seed/backfill changed existing users')
  assert.deepEqual(after.products.slice(0, baselineProducts.length), baselineProducts, 'seed/backfill changed a preexisting product row')
  assert.deepEqual(after.trips, before.trips, 'seed/backfill changed a trip')
  assert.deepEqual(after.items, before.items, 'seed/backfill changed an item snapshot')
  assert.deepEqual((await db.query(`SELECT name,category FROM cartcheck.products WHERE user_id=$1 AND source_starter_code='produce-apples'`, [users[0]])).rows[0], { name: 'My apples', category: 'Other' })
  record('Seed grew shared starters from 108 to 160; backfill produced 1120 copies and 1121 products while all baseline rows stayed unchanged')

  const afterFirst = await snapshot()
  await db.query(seedSql)
  await db.query(backfillSql)
  assert.deepEqual(await snapshot(), afterFirst, 'repeated seed/backfill changed database rows')
  record('Seed and backfill rerun made no row changes')

  const search = await listCatalog({ query: (sql, params) => db.query(sql, params) }, users[0], { search: 'ampal', category: 'Produce' })
  assert.ok(search.some((item) => item.name === 'Ampalaya' && item.category === 'Produce' && item.source === 'starter'))
  assert.ok(search.every((item) => item.name.toLowerCase().includes('ampal') && item.category === 'Produce'))
  const category = await listCatalog({ query: (sql, params) => db.query(sql, params) }, users[0], { category: 'Produce' })
  assert.ok(category.length > 0 && category.every((item) => item.category === 'Produce'))
  const otherUser = await listCatalog({ query: (sql, params) => db.query(sql, params) }, users[1], { search: 'Private flour' })
  assert.deepEqual(otherUser, [], 'custom products must remain private to their owner')
  record('Catalog repository search, category filtering, and user isolation work with backfilled rows')
  console.log(`LOCAL_CATALOG_DRY_RUN_OK database=${database} target=127.0.0.1:55439 productionAccess=false`)
} finally {
  await db.end()
}
