// Google's daily quota resets at midnight Pacific, so "today" does too.
const TODAY = `(now() AT TIME ZONE 'America/Los_Angeles')::date`
const RESETS_AT = `((${TODAY} + 1)::timestamp AT TIME ZONE 'America/Los_Angeles')`

const usageResult = (limit, count, resetsAt) => ({ limit, remaining: Math.max(limit - count, 0), resetsAt: resetsAt.toISOString() })

export async function getUsage(pool, userId, limit) {
  const { rows } = await pool.query(
    `SELECT ${RESETS_AT} AS resets_at,
       COALESCE((SELECT message_count FROM cartcheck.assistant_usage WHERE user_id = $1 AND usage_date = ${TODAY}), 0) AS message_count`,
    [userId],
  )
  return usageResult(limit, rows[0].message_count, rows[0].resets_at)
}

// Commits before returning so no connection is held during the model call.
export async function reserveMessage(pool, userId, { dailyLimit, appLimit }) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const clock = await client.query(`SELECT ${TODAY}::text AS usage_date, ${RESETS_AT} AS resets_at`)
    const { usage_date: usageDate, resets_at: resetsAt } = clock.rows[0]
    const account = await client.query(
      `INSERT INTO cartcheck.assistant_usage (user_id, usage_date, message_count)
       VALUES ($1, $2, 1)
       ON CONFLICT (user_id, usage_date) DO UPDATE
         SET message_count = cartcheck.assistant_usage.message_count + 1
         WHERE cartcheck.assistant_usage.message_count < $3
       RETURNING message_count`,
      [userId, usageDate, dailyLimit],
    )
    if (!account.rows.length) {
      await client.query('ROLLBACK')
      return { error: 'daily_limit', resetsAt: resetsAt.toISOString() }
    }
    const app = await client.query(
      `INSERT INTO cartcheck.assistant_app_usage (usage_date, message_count)
       VALUES ($1, 1)
       ON CONFLICT (usage_date) DO UPDATE
         SET message_count = cartcheck.assistant_app_usage.message_count + 1
         WHERE cartcheck.assistant_app_usage.message_count < $2
       RETURNING message_count`,
      [usageDate, appLimit],
    )
    if (!app.rows.length) {
      await client.query('ROLLBACK')
      return { error: 'app_limit', resetsAt: resetsAt.toISOString() }
    }
    await client.query('COMMIT')
    return { usageDate, usage: usageResult(dailyLimit, account.rows[0].message_count, resetsAt) }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

// The app-wide count stays: the failed call may still have used Google's quota.
export async function refundMessage(pool, userId, usageDate) {
  await pool.query(
    `UPDATE cartcheck.assistant_usage SET message_count = message_count - 1
     WHERE user_id = $1 AND usage_date = $2 AND message_count > 0`,
    [userId, usageDate],
  )
}
