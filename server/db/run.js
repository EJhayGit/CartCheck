// Explicit, non-destructive migration and seed runner. Review DATABASE_URL and
// the SQL before invoking this against any retained database.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { pool } from './pool.js'

const here = dirname(fileURLToPath(import.meta.url))
const command = process.argv[2]

async function migrate() {
  const files = readdirSync(join(here, 'migrations')).filter((name) => /^\d+_[\w-]+\.sql$/.test(name)).sort()
  const client = await pool.connect()
  try {
    await client.query('CREATE SCHEMA IF NOT EXISTS cartcheck')
    await client.query(`CREATE TABLE IF NOT EXISTS cartcheck.schema_migrations (
      filename text PRIMARY KEY,
      sha256 text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`)
    for (const filename of files) {
      const sql = readFileSync(join(here, 'migrations', filename), 'utf8')
      const sha256 = createHash('sha256').update(sql).digest('hex')
      await client.query('BEGIN')
      try {
        const applied = await client.query('SELECT sha256 FROM cartcheck.schema_migrations WHERE filename = $1', [filename])
        if (applied.rows.length) {
          if (applied.rows[0].sha256 !== sha256) throw new Error(`Applied migration changed: ${filename}`)
          await client.query('COMMIT')
          console.log(`already applied ${filename}`)
          continue
        }
        await client.query(sql)
        await client.query('INSERT INTO cartcheck.schema_migrations (filename, sha256) VALUES ($1, $2)', [filename, sha256])
        await client.query('COMMIT')
        console.log(`applied ${filename}`)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  } finally {
    client.release()
  }
}

async function seed() {
  await pool.query(readFileSync(join(here, 'seed.sql'), 'utf8'))
  console.log('starter products seeded')
}

try {
  if (command === 'migrate') await migrate()
  else if (command === 'seed') await seed()
  else throw new Error('Usage: node db/run.js migrate|seed')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
