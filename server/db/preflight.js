// Read-only connection check. Never prints the URL or password.
import { pool } from './pool.js'

let client

try {
  client = await pool.connect()
  const result = await client.query(`
    SELECT current_database() IS NOT NULL AS connected,
      (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = 'cartcheck') AS cartcheck_tables
  `)
  const url = new URL(process.env.DATABASE_URL)
  const mode = url.hostname.endsWith('.pooler.supabase.com')
    ? (url.port === '5432' ? 'session pooler' : 'other pooler mode')
    : 'direct or custom host'
  const tls = client.connection.stream.encrypted === true
  const catalog = result.rows[0].cartcheck_tables > 0
    ? (await client.query('SELECT count(*)::int AS rows, count(DISTINCT code)::int AS unique_codes FROM cartcheck.starter_products')).rows[0]
    : null
  const shopperRows = result.rows[0].cartcheck_tables > 0
    ? (await client.query(`SELECT
        (SELECT count(*)::int FROM cartcheck.users) AS users,
        (SELECT count(*)::int FROM cartcheck.products) AS products,
        (SELECT count(*)::int FROM cartcheck.shopping_trips) AS trips,
        (SELECT count(*)::int FROM cartcheck.trip_items) AS items`)).rows[0]
    : null
  console.log({ ...result.rows[0], tls_to_endpoint: tls, connection_mode: mode, starter_catalog: catalog, shopper_rows: shopperRows })
  if (!tls) process.exitCode = 1
} catch (error) {
  console.error(`preflight failed: ${error.message}`)
  process.exitCode = 1
} finally {
  client?.release()
  await pool.end()
}
