function item(row) {
  return {
    id: String(row.id),
    productId: String(row.product_id),
    name: row.name,
    category: row.category,
    quantity: row.quantity,
    unitLabel: row.unit_label,
    estimatedTotal: row.estimated_total,
    actualTotal: row.actual_total,
    bought: row.bought,
  }
}

async function activeTrip(pool, userId) {
  return ensureActiveTrip(pool, userId)
}

async function ensureActiveTrip(queryable, userId) {
  await queryable.query(
    `INSERT INTO cartcheck.shopping_trips (user_id, status, currency)
     SELECT id, 'active', preferred_currency FROM cartcheck.users WHERE id = $1
     ON CONFLICT (user_id) WHERE status = 'active' DO NOTHING`,
    [userId]
  )
  const result = await queryable.query(
    `SELECT id, currency, budget, revision FROM cartcheck.shopping_trips
     WHERE user_id = $1 AND status = 'active'`,
    [userId]
  )
  return result.rows[0]
}

async function withTransaction(pool, callback) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const value = await callback(client)
    await client.query('COMMIT')
    return value
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally { client.release() }
}

export async function getCart(pool, userId) {
  return withTransaction(pool, async (client) => {
  await ensureActiveTrip(client, userId)
  const locked = await client.query(`SELECT id, currency, budget, revision FROM cartcheck.shopping_trips
    WHERE user_id = $1 AND status = 'active' FOR UPDATE`, [userId])
  const trip = locked.rows[0]
  const result = await client.query(
    `SELECT i.id, i.product_id, i.name, i.category, i.quantity, i.unit_label,
            i.estimated_total, i.actual_total, i.bought
     FROM cartcheck.trip_items i
     JOIN cartcheck.shopping_trips t ON t.id = i.trip_id AND t.user_id = i.user_id
     WHERE t.user_id = $1 AND t.id = $2 AND t.status = 'active'
     ORDER BY i.created_at, i.id`,
    [userId, trip.id]
  )
  const totals = await client.query(
    `SELECT sum(estimated_total) AS estimated_total,
            count(*) FILTER (WHERE estimated_total IS NULL)::int AS estimated_missing_count,
            sum(actual_total) FILTER (WHERE bought) AS actual_total,
            count(*) FILTER (WHERE bought AND actual_total IS NULL)::int AS actual_missing_count
     FROM cartcheck.trip_items
     WHERE user_id = $1 AND trip_id = $2`,
    [userId, trip.id]
  )
  const total = totals.rows[0]
  return {
    tripId: String(trip.id),
    revision: trip.revision,
    budget: trip.budget,
    currency: trip.currency,
    items: result.rows.map(item),
    summary: {
      estimatedTotal: total.estimated_total,
      estimatedMissingCount: total.estimated_missing_count,
      actualTotal: total.actual_total,
      actualMissingCount: total.actual_missing_count,
    },
  }
  })
}

export async function updateActiveBudget(pool, userId, budget) {
  return withTransaction(pool, async (client) => {
  await ensureActiveTrip(client, userId)
  const locked = await client.query(`SELECT id FROM cartcheck.shopping_trips
    WHERE user_id = $1 AND status = 'active' FOR UPDATE`, [userId])
  const tripId = locked.rows[0]?.id
  if (!tripId) return null
  const result = await client.query(
    `UPDATE cartcheck.shopping_trips
     SET budget = $3, revision = revision + 1
     WHERE id = $1 AND user_id = $2 AND status = 'active'
     RETURNING budget, currency`,
    [tripId, userId, budget]
  )
  return result.rows[0] ?? null
  })
}

export async function updatePreferredCurrency(pool, userId, preferredCurrency) {
  const result = await pool.query(
    `UPDATE cartcheck.users SET preferred_currency = $2, updated_at = now()
     WHERE id = $1 RETURNING preferred_currency`,
    [userId, preferredCurrency]
  )
  return result.rows[0]?.preferred_currency ?? null
}

export async function addCatalogItem(pool, userId, productId) {
  return withTransaction(pool, async (client) => {
  await ensureActiveTrip(client, userId)
  const locked = await client.query(`SELECT id FROM cartcheck.shopping_trips
    WHERE user_id = $1 AND status = 'active' FOR UPDATE`, [userId])
  const tripId = locked.rows[0]?.id
  if (!tripId) return null
  const inserted = await client.query(
    `INSERT INTO cartcheck.trip_items (user_id, trip_id, product_id, name, category, quantity)
     SELECT $1, $2, p.id, p.name, p.category, 1
     FROM cartcheck.products p
     WHERE p.user_id = $1 AND p.id = $3
       AND EXISTS (SELECT 1 FROM cartcheck.shopping_trips t
                   WHERE t.id = $2 AND t.user_id = $1 AND t.status = 'active')
     ON CONFLICT (trip_id, product_id) DO NOTHING
     RETURNING id, product_id, name, category, quantity, unit_label, estimated_total, actual_total, bought`,
    [userId, tripId, productId]
  )
  if (inserted.rows[0]) {
    await client.query('UPDATE cartcheck.shopping_trips SET revision = revision + 1 WHERE id = $1 AND user_id = $2 AND status = \'active\'', [tripId, userId])
    return { item: item(inserted.rows[0]), created: true }
  }
  const existing = await client.query(
    `SELECT i.id, i.product_id, i.name, i.category, i.quantity, i.unit_label,
            i.estimated_total, i.actual_total, i.bought
     FROM cartcheck.trip_items i
     JOIN cartcheck.shopping_trips t ON t.id = i.trip_id AND t.user_id = i.user_id
     WHERE t.user_id = $1 AND t.id = $2 AND t.status = 'active' AND i.product_id = $3`,
    [userId, tripId, productId]
  )
  return existing.rows[0] ? { item: item(existing.rows[0]), created: false } : null
  })
}

export async function updateItem(pool, userId, itemId, changes) {
  const fields = []
  const values = [userId, itemId]
  for (const [key, column] of [
    ['name', 'name'], ['quantity', 'quantity'], ['unitLabel', 'unit_label'],
    ['estimatedTotal', 'estimated_total'], ['actualTotal', 'actual_total'], ['bought', 'bought'],
  ]) {
    if (Object.hasOwn(changes, key)) {
      values.push(changes[key])
      fields.push(`${column} = $${values.length}`)
    }
  }
  return withTransaction(pool, async (client) => {
  const locked = await client.query(
    `SELECT t.id FROM cartcheck.shopping_trips t JOIN cartcheck.trip_items i
       ON i.trip_id = t.id AND i.user_id = t.user_id
     WHERE i.user_id = $1 AND i.id = $2 AND t.status = 'active' FOR UPDATE OF t`, [userId, itemId])
  if (!locked.rows[0]) return null
  const result = await client.query(
    `UPDATE cartcheck.trip_items i SET ${fields.join(', ')}, updated_at = now()
     WHERE i.user_id = $1 AND i.id = $2
       AND EXISTS (SELECT 1 FROM cartcheck.shopping_trips t
                   WHERE t.id = i.trip_id AND t.user_id = $1 AND t.status = 'active')
     RETURNING i.id, i.product_id, i.name, i.category, i.quantity, i.unit_label,
               i.estimated_total, i.actual_total, i.bought`,
    values
  )
  if (result.rows[0]) {
    await client.query(`UPDATE cartcheck.shopping_trips t SET revision = revision + 1
      WHERE t.id = (SELECT i.trip_id FROM cartcheck.trip_items i WHERE i.id = $1 AND i.user_id = $2)
        AND t.user_id = $2 AND t.status = 'active'`, [itemId, userId])
  }
  return result.rows[0] ? item(result.rows[0]) : null
  })
}

export async function deleteItem(pool, userId, itemId) {
  return withTransaction(pool, async (client) => {
  const locked = await client.query(
    `SELECT t.id FROM cartcheck.shopping_trips t JOIN cartcheck.trip_items i
       ON i.trip_id = t.id AND i.user_id = t.user_id
     WHERE i.user_id = $1 AND i.id = $2 AND t.status = 'active' FOR UPDATE OF t`, [userId, itemId])
  if (!locked.rows[0]) return false
  const result = await client.query(
    `DELETE FROM cartcheck.trip_items i
     WHERE i.user_id = $1 AND i.id = $2
       AND EXISTS (SELECT 1 FROM cartcheck.shopping_trips t
                   WHERE t.id = i.trip_id AND t.user_id = $1 AND t.status = 'active')
     RETURNING i.id, i.trip_id`,
    [userId, itemId]
  )
  if (result.rowCount) {
    await client.query(`UPDATE cartcheck.shopping_trips SET revision = revision + 1
      WHERE id = $1 AND user_id = $2 AND status = 'active'`, [result.rows[0].trip_id, userId])
  }
  return result.rowCount > 0
  })
}
