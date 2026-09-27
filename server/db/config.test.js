import test from 'node:test'
import assert from 'node:assert/strict'
import { poolConfig } from './config.js'

test('local PostgreSQL uses no TLS', () => {
  const config = poolConfig({ DATABASE_URL: 'postgresql://postgres:example@localhost:5432/cartcheck' })
  assert.equal(config.ssl, false)
  assert.equal(config.max, 5)
})

test('hosted PostgreSQL verifies its certificate', () => {
  const config = poolConfig({ DATABASE_URL: 'postgresql://postgres:example@db.example.test:5432/postgres' })
  assert.deepEqual(config.ssl, { rejectUnauthorized: true })
})

test('invalid or weakening configuration fails before connecting', () => {
  for (const env of [
    {},
    { DATABASE_URL: 'https://example.test/db' },
    { DATABASE_URL: 'postgresql://u:p@db.example.test/postgres?sslmode=disable' },
    { DATABASE_URL: 'postgresql://u:p@db.example.test/postgres?ssl=0' },
    { DATABASE_URL: 'postgresql://u:p@db.example.test/postgres', DB_POOL_MAX: '0' },
  ]) assert.throws(() => poolConfig(env))
})
