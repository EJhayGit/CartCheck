import { readFileSync } from 'node:fs'

export function poolConfig(env = process.env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required on the Express server')
  let url
  try {
    url = new URL(env.DATABASE_URL)
  } catch {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL')
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname || url.pathname === '/') {
    throw new Error('DATABASE_URL must name a PostgreSQL host and database')
  }
  const local = ['localhost', '127.0.0.1', '::1', '[::1]', 'db'].includes(url.hostname)
  if (url.search) {
    throw new Error('Remove URL options from DATABASE_URL; set TLS through SSL_CA_FILE')
  }
  const max = env.DB_POOL_MAX === undefined ? 5 : Number(env.DB_POOL_MAX)
  if (!Number.isInteger(max) || max < 1 || max > 20) throw new Error('DB_POOL_MAX must be an integer from 1 to 20')
  const ssl = local ? false : {
    rejectUnauthorized: true,
    ...(env.SSL_CA_FILE ? { ca: readFileSync(env.SSL_CA_FILE, 'utf8') } : {}),
  }
  return {
    connectionString: env.DATABASE_URL,
    ssl,
    max,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  }
}
