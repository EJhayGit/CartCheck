function mapItem(row) {
  return {
    id: String(row.id), productId: row.product_id === null ? null : String(row.product_id),
    name: row.name, category: row.category, quantity: row.quantity, unitLabel: row.unit_label,
    estimatedTotal: row.estimated_total, actualTotal: row.actual_total, bought: row.bought,
  }
}

async function tripItems(queryable, userId, tripId) {
  const result = await queryable.query(
    `SELECT id, product_id, name, category, quantity, unit_label, estimated_total, actual_total, bought
     FROM cartcheck.trip_items WHERE user_id = $1 AND trip_id = $2 ORDER BY created_at, id`,
    [userId, tripId]
  )
  return result.rows.map(mapItem)
}

async function tripSummary(queryable, userId, tripId) {
  const result = await queryable.query(
    `SELECT sum(estimated_total) AS estimated_total,
            count(*) FILTER (WHERE estimated_total IS NULL)::int AS estimated_missing_count,
            sum(actual_total) FILTER (WHERE bought) AS actual_total,
            count(*) FILTER (WHERE bought AND actual_total IS NULL)::int AS actual_missing_count
     FROM cartcheck.trip_items WHERE user_id = $1 AND trip_id = $2`,
    [userId, tripId]
  )
  const row = result.rows[0]
  return { estimatedTotal: row.estimated_total, estimatedMissingCount: row.estimated_missing_count,
    actualTotal: row.actual_total, actualMissingCount: row.actual_missing_count }
}

async function detail(queryable, userId, row) {
  return { id: String(row.id), completedAt: row.completed_at, currency: row.currency,
    revision: row.revision, items: await tripItems(queryable, userId, row.id),
    summary: await tripSummary(queryable, userId, row.id) }
}

export async function finishTrip(pool, userId, tripId, revision) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const locked = await client.query(
      `SELECT id, status, currency, revision, completed_at FROM cartcheck.shopping_trips
       WHERE id = $1 AND user_id = $2 FOR UPDATE`, [tripId, userId]
    )
    const trip = locked.rows[0]
    if (!trip) { await client.query('ROLLBACK'); return { error: 'not_found' } }
    if (trip.status === 'completed') {
      const completedTrip = await detail(client, userId, trip)
      const activeTrip = await ensureActive(client, userId)
      await client.query('COMMIT')
      return { completedTrip, activeTrip }
    }
    if (trip.revision !== revision) { await client.query('ROLLBACK'); return { error: 'stale' } }
    const count = await client.query('SELECT count(*)::int AS count FROM cartcheck.trip_items WHERE user_id = $1 AND trip_id = $2', [userId, tripId])
    if (!count.rows[0].count) { await client.query('ROLLBACK'); return { error: 'empty' } }
    const completed = await client.query(
      `UPDATE cartcheck.shopping_trips SET status = 'completed', completed_at = now(), revision = revision + 1
       WHERE id = $1 AND user_id = $2 AND status = 'active'
       RETURNING id, status, currency, revision, completed_at`, [tripId, userId]
    )
    await client.query('UPDATE cartcheck.trip_items SET product_id = NULL WHERE user_id = $1 AND trip_id = $2', [userId, tripId])
    const activeTrip = await ensureActive(client, userId)
    const completedTrip = await detail(client, userId, completed.rows[0])
    await client.query('COMMIT')
    return { completedTrip, activeTrip }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally { client.release() }
}

async function ensureActive(queryable, userId) {
  await queryable.query(
    `INSERT INTO cartcheck.shopping_trips (user_id, status, currency)
     SELECT id, 'active', preferred_currency FROM cartcheck.users WHERE id = $1
     ON CONFLICT (user_id) WHERE status = 'active' DO NOTHING`, [userId]
  )
  const result = await queryable.query(
    `SELECT id, currency, budget, revision FROM cartcheck.shopping_trips
     WHERE user_id = $1 AND status = 'active'`, [userId]
  )
  const row = result.rows[0]
  return { tripId: String(row.id), revision: row.revision, currency: row.currency, budget: row.budget,
    items: await tripItems(queryable, userId, row.id), summary: await tripSummary(queryable, userId, row.id) }
}

export async function listTrips(pool, userId, { limit, cursor }) {
  const result = await pool.query(
    `SELECT t.id, t.completed_at, t.currency, t.revision,
            count(i.id)::int AS item_count,
            count(i.id) FILTER (WHERE i.bought)::int AS bought_count,
            count(i.id) FILTER (WHERE NOT i.bought)::int AS not_bought_count,
            sum(i.estimated_total) AS estimated_total,
            count(i.id) FILTER (WHERE i.estimated_total IS NULL)::int AS estimated_missing_count,
            sum(i.actual_total) FILTER (WHERE i.bought) AS actual_total,
            count(i.id) FILTER (WHERE i.bought AND i.actual_total IS NULL)::int AS actual_missing_count
     FROM cartcheck.shopping_trips t LEFT JOIN cartcheck.trip_items i ON i.trip_id = t.id AND i.user_id = t.user_id
     WHERE t.user_id = $1 AND t.status = 'completed'
       AND ($2::timestamptz IS NULL OR (t.completed_at, t.id) < ($2::timestamptz, $3::bigint))
     GROUP BY t.id ORDER BY t.completed_at DESC, t.id DESC LIMIT $4`,
    [userId, cursor?.completedAt ?? null, cursor?.id ?? null, limit + 1]
  )
  const hasMore = result.rows.length > limit
  const rows = result.rows.slice(0, limit)
  const items = rows.map((row) => ({ id: String(row.id), completedAt: row.completed_at, currency: row.currency,
    itemCount: row.item_count, boughtCount: row.bought_count, notBoughtCount: row.not_bought_count,
    summary: { estimatedTotal: row.estimated_total, estimatedMissingCount: row.estimated_missing_count,
      actualTotal: row.actual_total, actualMissingCount: row.actual_missing_count } }))
  const last = rows.at(-1)
  return { items, nextCursor: hasMore && last
    ? Buffer.from(JSON.stringify({ completedAt: last.completed_at.toISOString(), id: String(last.id) })).toString('base64url')
    : null }
}

export async function getTrip(pool, userId, tripId) {
  const result = await pool.query(
    `SELECT id, completed_at, currency, revision FROM cartcheck.shopping_trips
     WHERE id = $1 AND user_id = $2 AND status = 'completed'`, [tripId, userId]
  )
  return result.rows[0] ? detail(pool, userId, result.rows[0]) : null
}

export async function correctTrip(pool, userId, tripId, revision, items) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const found = await client.query(
      `SELECT id, status, currency, revision, completed_at FROM cartcheck.shopping_trips
       WHERE id = $1 AND user_id = $2 FOR UPDATE`, [tripId, userId]
    )
    const trip = found.rows[0]
    if (!trip || trip.status !== 'completed') { await client.query('ROLLBACK'); return { error: 'not_found' } }
    if (trip.revision !== revision) { await client.query('ROLLBACK'); return { error: 'stale' } }

    const existing = await client.query('SELECT id FROM cartcheck.trip_items WHERE user_id = $1 AND trip_id = $2', [userId, tripId])
    const existingIds = new Set(existing.rows.map((row) => String(row.id)))
    for (const candidate of items) {
      if (candidate.id !== null && !existingIds.has(String(candidate.id))) {
        await client.query('ROLLBACK'); return { error: 'invalid_item' }
      }
    }
    const retained = items.filter((candidate) => candidate.id !== null).map((candidate) => String(candidate.id))
    await client.query(
      `DELETE FROM cartcheck.trip_items WHERE user_id = $1 AND trip_id = $2
       AND NOT (id = ANY($3::bigint[]))`, [userId, tripId, retained]
    )
    for (const candidate of items) {
      if (candidate.id !== null) {
        await client.query(
          `UPDATE cartcheck.trip_items SET name=$4, category=$5, quantity=$6, unit_label=$7,
             estimated_total=$8, actual_total=$9, bought=$10, updated_at=now()
           WHERE id=$1 AND trip_id=$2 AND user_id=$3`,
          [candidate.id, tripId, userId, candidate.name, candidate.category, candidate.quantity,
            candidate.unitLabel, candidate.estimatedTotal, candidate.actualTotal, candidate.bought]
        )
      } else {
        await client.query(
          `INSERT INTO cartcheck.trip_items (user_id, trip_id, product_id, name, category, quantity,
             unit_label, estimated_total, actual_total, bought)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [userId, tripId, candidate.productId, candidate.name, candidate.category, candidate.quantity,
            candidate.unitLabel, candidate.estimatedTotal, candidate.actualTotal, candidate.bought]
        )
      }
    }
    const updated = await client.query(
      `UPDATE cartcheck.shopping_trips SET revision = revision + 1
       WHERE id = $1 AND user_id = $2 AND status = 'completed'
       RETURNING id, status, currency, revision, completed_at`, [tripId, userId]
    )
    const correctedTrip = await detail(client, userId, updated.rows[0])
    await client.query('COMMIT')
    return { trip: correctedTrip }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally { client.release() }
}
