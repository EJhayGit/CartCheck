export async function updatePreferredCurrency(pool, userId, preferredCurrency) {
  const result = await pool.query(
    `UPDATE cartcheck.users SET preferred_currency = $2, updated_at = now()
     WHERE id = $1 RETURNING preferred_currency`,
    [userId, preferredCurrency]
  )
  return result.rows[0]?.preferred_currency ?? null
}
