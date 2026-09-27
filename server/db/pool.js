import pg from 'pg'
import { poolConfig } from './config.js'

// Fail at boot with one clear line, rather than with a mystery 500 an hour
// later. The commonest deployment mistake is setting a variable in .env on your
// laptop and never setting it in the host's dashboard.
export const pool = new pg.Pool(poolConfig())

// A pool whose server goes away should say so once, loudly, not take the
// process down.
pool.on('error', (error) => {
  console.error('Unexpected database pool error:', error.message)
})
