// Exercises the Milestone 1 schema against PostgreSQL. Every test row is rolled
// back, including when an assertion fails.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { pool } from './pool.js'

const client = await pool.connect()
const results = []

async function rejects(name, sql, values, code) {
  await client.query('SAVEPOINT constraint_check')
  try {
    await client.query(sql, values)
    throw new Error(`${name}: accepted an invalid row`)
  } catch (error) {
    if (error.code !== code) throw error
    results.push(`${name}: rejected (${code})`)
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT constraint_check')
    await client.query('RELEASE SAVEPOINT constraint_check')
  }
}

try {
  await client.query('BEGIN')
  const seed = await client.query('SELECT count(*)::int AS count, count(DISTINCT code)::int AS unique_count FROM cartcheck.starter_products')
  assert.equal(seed.rows[0].count, 160)
  assert.equal(seed.rows[0].unique_count, 160)
  results.push('starter rows: 160 unique codes')

  const suffix = randomUUID()
  const users = await client.query(
    `INSERT INTO cartcheck.users (email, password_hash) VALUES ($1, 'test-only'), ($2, 'test-only') RETURNING id`,
    [`m1-${suffix}-a@example.invalid`, `m1-${suffix}-b@example.invalid`],
  )
  const [user1, user2] = users.rows.map((row) => row.id)
  await rejects('unique normalized email',
    `INSERT INTO cartcheck.users (email, password_hash) VALUES ($1, 'test-only')`,
    [`m1-${suffix}-a@example.invalid`], '23505')
  await rejects('approved currency only',
    `INSERT INTO cartcheck.shopping_trips (user_id, name, currency) VALUES ($1, 'Test list', 'GBP')`, [user1], '23514')
  const products = await client.query(
    `INSERT INTO cartcheck.products (user_id, source_starter_code, name, category)
     VALUES ($1, 'produce-apples', 'Apples', 'Produce'), ($2, 'produce-apples', 'Apples', 'Produce') RETURNING id`,
    [user1, user2],
  )
  const [product1, product2] = products.rows.map((row) => row.id)
  const trips = await client.query(
    `INSERT INTO cartcheck.shopping_trips (user_id, name, currency) VALUES ($1, 'First list', 'PHP'), ($2, 'Other owner', 'USD') RETURNING id`,
    [user1, user2],
  )
  const [trip1, trip2] = trips.rows.map((row) => row.id)

  await client.query(`INSERT INTO cartcheck.shopping_trips (user_id, name, currency) VALUES ($1, 'Second list', 'PHP')`, [user1])
  results.push('multiple active lists per owner: accepted')
  await rejects('list name required',
    `INSERT INTO cartcheck.shopping_trips (user_id, currency) VALUES ($1, 'PHP')`, [user1], '23502')
  await rejects('unique starter copy per owner',
    `INSERT INTO cartcheck.products (user_id, source_starter_code, name, category)
     VALUES ($1, 'produce-apples', 'Apple copy', 'Produce')`, [user1], '23505')
  await rejects('trip owner foreign key',
    `INSERT INTO cartcheck.trip_items (user_id, trip_id, product_id, name, category, quantity)
     VALUES ($1, $2, $3, 'Apples', 'Produce', 1)`, [user2, trip1, product2], '23503')
  await rejects('product owner foreign key',
    `INSERT INTO cartcheck.trip_items (user_id, trip_id, product_id, name, category, quantity)
     VALUES ($1, $2, $3, 'Apples', 'Produce', 1)`, [user1, trip1, product2], '23503')
  await rejects('missing product foreign key',
    `INSERT INTO cartcheck.trip_items (user_id, trip_id, product_id, name, category, quantity)
     VALUES ($1, $2, -1, 'Apples', 'Produce', 1)`, [user1, trip1], '23503')
  await rejects('positive quantity',
    `INSERT INTO cartcheck.trip_items (user_id, trip_id, product_id, name, category, quantity)
     VALUES ($1, $2, $3, 'Apples', 'Produce', 0)`, [user1, trip1, product1], '23514')
  await rejects('nonnegative item total',
    `INSERT INTO cartcheck.trip_items (user_id, trip_id, product_id, name, category, quantity, actual_total)
     VALUES ($1, $2, $3, 'Apples', 'Produce', 1, -0.01)`, [user1, trip1, product1], '23514')

  const nullable = await client.query(
    `INSERT INTO cartcheck.trip_items (user_id, trip_id, product_id, name, category, quantity)
     VALUES ($1, $2, $3, 'Apples', 'Produce', 1)
     RETURNING id, estimated_total, actual_total`, [user1, trip1, product1],
  )
  assert.equal(nullable.rows[0].estimated_total, null)
  assert.equal(nullable.rows[0].actual_total, null)
  results.push('missing estimated and actual totals: NULL')

  const independent = await client.query(
    `UPDATE cartcheck.trip_items SET actual_total = 0.00 WHERE id = $1
     RETURNING estimated_total, actual_total`, [nullable.rows[0].id],
  )
  assert.equal(independent.rows[0].estimated_total, null)
  assert.equal(independent.rows[0].actual_total, '0.00')
  results.push('independent totals: estimate NULL while actual is 0.00')

  await rejects('one product entry per trip',
    `INSERT INTO cartcheck.trip_items (user_id, trip_id, product_id, name, category, quantity)
     VALUES ($1, $2, $3, 'Apples', 'Produce', 1)`, [user1, trip1, product1], '23505')

  const zero = await client.query(
    `UPDATE cartcheck.trip_items SET estimated_total = 0.00, actual_total = 0.00
     WHERE id = $1 RETURNING estimated_total, actual_total`, [nullable.rows[0].id],
  )
  assert.equal(zero.rows[0].estimated_total, '0.00')
  assert.equal(zero.rows[0].actual_total, '0.00')
  results.push('zero estimated and actual totals: 0.00, distinct from NULL')

  assert.notEqual(trip1, trip2)
  await client.query('ROLLBACK')
  for (const result of results) console.log(result)
  console.log('all verification rows rolled back')
} catch (error) {
  await client.query('ROLLBACK')
  console.error(error)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
