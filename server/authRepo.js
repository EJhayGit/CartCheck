export async function createAccount(pool, { email, passwordHash, sessionHash, expiresAt }) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const inserted = await client.query(
      `INSERT INTO cartcheck.users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, preferred_currency`,
      [email, passwordHash]
    )
    const user = inserted.rows[0]
    await client.query(
      `INSERT INTO cartcheck.products (user_id, source_starter_code, name, category)
       SELECT $1, code, name, category FROM cartcheck.starter_products
       ON CONFLICT (user_id, source_starter_code) DO NOTHING`,
      [user.id]
    )
    await client.query(
      `INSERT INTO cartcheck.shopping_trips (user_id, status, currency)
       VALUES ($1, 'active', $2)`,
      [user.id, user.preferred_currency]
    )
    await client.query(
      `INSERT INTO cartcheck.sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, sessionHash, expiresAt]
    )
    await client.query('COMMIT')
    return user
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function findUserByEmail(pool, email) {
  const result = await pool.query(
    `SELECT id, email, preferred_currency, password_hash
     FROM cartcheck.users WHERE email = $1`,
    [email]
  )
  return result.rows[0] ?? null
}

export async function createSession(pool, { userId, sessionHash, expiresAt }) {
  await pool.query(
    `INSERT INTO cartcheck.sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, sessionHash, expiresAt]
  )
}

export async function findUserBySessionHash(pool, sessionHash) {
  const result = await pool.query(
    `SELECT u.id, u.email, u.preferred_currency
     FROM cartcheck.sessions s
     JOIN cartcheck.users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sessionHash]
  )
  return result.rows[0] ?? null
}

export async function revokeSession(pool, sessionHash) {
  const result = await pool.query(
    `DELETE FROM cartcheck.sessions WHERE token_hash = $1 RETURNING id`,
    [sessionHash]
  )
  return result.rowCount > 0
}

export async function deleteExpiredSessions(pool) {
  await pool.query('DELETE FROM cartcheck.sessions WHERE expires_at <= now()')
}
