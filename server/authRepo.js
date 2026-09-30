import { ACCOUNT_TOKEN_TTL_MINUTES } from './authSecurity.js'

export async function createAccount(pool, { email, passwordHash, sessionHash, expiresAt }) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const inserted = await client.query(
      `INSERT INTO cartcheck.users (email, password_hash, email_verified, legacy_verification_exempt)
       VALUES ($1, $2, false, false)
       RETURNING id, email, preferred_currency, email_verified, legacy_verification_exempt`,
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
    `SELECT id, email, preferred_currency, password_hash, email_verified, legacy_verification_exempt
     FROM cartcheck.users WHERE email = $1`,
    [email]
  )
  return result.rows[0] ?? null
}

// Serialize login with password resets/changes. If login wins the row lock,
// the subsequent password mutation will revoke its new session; if the
// password mutation wins, this check prevents a stale-password login.
export async function createSessionForPasswordHash(pool, { userId, passwordHash, sessionHash, expiresAt }) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const user = await client.query(
      `SELECT id FROM cartcheck.users WHERE id = $1 AND password_hash = $2 FOR UPDATE`,
      [userId, passwordHash]
    )
    if (!user.rowCount) {
      await client.query('ROLLBACK')
      return false
    }
    await client.query(
      `INSERT INTO cartcheck.sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, sessionHash, expiresAt]
    )
    await client.query('COMMIT')
    return true
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

export async function findUserBySessionHash(pool, sessionHash) {
  const result = await pool.query(
    `SELECT u.id, u.email, u.preferred_currency, u.email_verified, u.legacy_verification_exempt
     FROM cartcheck.sessions s
     JOIN cartcheck.users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sessionHash]
  )
  return result.rows[0] ?? null
}

const TOKEN_TTL_MS = ACCOUNT_TOKEN_TTL_MINUTES * 60 * 1000
const EMAIL_COOLDOWN_SECONDS = 60

export async function issueAccountToken(pool, { userId, purpose, tokenHash, cooldownSeconds = EMAIL_COOLDOWN_SECONDS }) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const allowed = await client.query(
      `INSERT INTO cartcheck.auth_email_limits (user_id, purpose, last_sent_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id, purpose) DO UPDATE
         SET last_sent_at = now()
         WHERE cartcheck.auth_email_limits.last_sent_at <= now() - ($3 * interval '1 second')
       RETURNING user_id`,
      [userId, purpose, cooldownSeconds]
    )
    if (!allowed.rowCount) {
      await client.query('ROLLBACK')
      return false
    }
    await client.query(
      `INSERT INTO cartcheck.auth_action_tokens (user_id, purpose, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + ($4 * interval '1 millisecond'))`,
      [userId, purpose, tokenHash, TOKEN_TTL_MS]
    )
    await client.query('COMMIT')
    return true
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

// Keep previous links usable while a newly issued message is in flight. Call
// only after the email provider accepts the message.
export async function finalizeAccountToken(pool, { userId, purpose, tokenHash }) {
  await pool.query(
    `DELETE FROM cartcheck.auth_action_tokens
     WHERE user_id = $1 AND purpose = $2 AND token_hash <> $3`,
    [userId, purpose, tokenHash]
  )
}

export async function discardAccountToken(pool, tokenHash) {
  await pool.query(`DELETE FROM cartcheck.auth_action_tokens WHERE token_hash = $1`, [tokenHash])
}

async function consumeAccountToken(client, { tokenHash, purpose }) {
  const result = await client.query(
    `DELETE FROM cartcheck.auth_action_tokens
     WHERE token_hash = $1 AND purpose = $2 AND expires_at > now()
     RETURNING user_id`,
    [tokenHash, purpose]
  )
  return result.rows[0]?.user_id ?? null
}

export async function verifyAccountEmail(pool, tokenHash) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const userId = await consumeAccountToken(client, { tokenHash, purpose: 'verify_email' })
    if (!userId) { await client.query('ROLLBACK'); return null }
    const result = await client.query(
      `UPDATE cartcheck.users SET email_verified = true, updated_at = now()
       WHERE id = $1
       RETURNING id, email, preferred_currency, email_verified, legacy_verification_exempt`,
      [userId]
    )
    await client.query('COMMIT')
    return result.rows[0] ?? null
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

export async function resetPasswordWithToken(pool, { tokenHash, passwordHash }) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const userId = await consumeAccountToken(client, { tokenHash, purpose: 'reset_password' })
    if (!userId) { await client.query('ROLLBACK'); return false }
    await client.query(
      `UPDATE cartcheck.users SET password_hash = $2, updated_at = now() WHERE id = $1`,
      [userId, passwordHash]
    )
    await client.query(
      `DELETE FROM cartcheck.auth_action_tokens WHERE user_id = $1 AND purpose = 'reset_password'`,
      [userId]
    )
    await client.query('DELETE FROM cartcheck.sessions WHERE user_id = $1', [userId])
    await client.query('COMMIT')
    return true
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

export async function changePasswordAndRevokeSessions(pool, { userId, currentPasswordHash, passwordHash }) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query(
      `UPDATE cartcheck.users SET password_hash = $3, updated_at = now()
       WHERE id = $1 AND password_hash = $2 RETURNING id`,
      [userId, currentPasswordHash, passwordHash]
    )
    if (!result.rowCount) { await client.query('ROLLBACK'); return false }
    await client.query(
      `DELETE FROM cartcheck.auth_action_tokens WHERE user_id = $1 AND purpose = 'reset_password'`,
      [userId]
    )
    await client.query('DELETE FROM cartcheck.sessions WHERE user_id = $1', [userId])
    await client.query('COMMIT')
    return true
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
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
