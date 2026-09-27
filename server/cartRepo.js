function item(row) {
  return {
    id: String(row.id),
    productId: String(row.product_id),
    name: row.name,
    category: row.category,
    quantity: row.quantity,
    unitLabel: row.unit_label,
  }
}

async function activeTrip(pool, userId) {
  await pool.query(
    `INSERT INTO cartcheck.shopping_trips (user_id, status, currency)
     SELECT id, 'active', preferred_currency FROM cartcheck.users WHERE id = $1
     ON CONFLICT (user_id) WHERE status = 'active' DO NOTHING`,
    [userId]
  )
  const result = await pool.query(
    `SELECT id, currency FROM cartcheck.shopping_trips
     WHERE user_id = $1 AND status = 'active'`,
    [userId]
  )
  return result.rows[0]
}

export async function getCart(pool, userId) {
  const trip = await activeTrip(pool, userId)
  const result = await pool.query(
    `SELECT i.id, i.product_id, i.name, i.category, i.quantity, i.unit_label
     FROM cartcheck.trip_items i
     JOIN cartcheck.shopping_trips t ON t.id = i.trip_id AND t.user_id = i.user_id
     WHERE t.user_id = $1 AND t.id = $2 AND t.status = 'active'
     ORDER BY i.created_at, i.id`,
    [userId, trip.id]
  )
  return { currency: trip.currency, items: result.rows.map(item) }
}

export async function addCatalogItem(pool, userId, productId) {
  const trip = await activeTrip(pool, userId)
  const inserted = await pool.query(
    `INSERT INTO cartcheck.trip_items (user_id, trip_id, product_id, name, category, quantity)
     SELECT $1, $2, p.id, p.name, p.category, 1
     FROM cartcheck.products p
     WHERE p.user_id = $1 AND p.id = $3
       AND EXISTS (SELECT 1 FROM cartcheck.shopping_trips t
                   WHERE t.id = $2 AND t.user_id = $1 AND t.status = 'active')
     ON CONFLICT (trip_id, product_id) DO NOTHING
     RETURNING id, product_id, name, category, quantity, unit_label`,
    [userId, trip.id, productId]
  )
  if (inserted.rows[0]) return { item: item(inserted.rows[0]), created: true }
  const existing = await pool.query(
    `SELECT i.id, i.product_id, i.name, i.category, i.quantity, i.unit_label
     FROM cartcheck.trip_items i
     JOIN cartcheck.shopping_trips t ON t.id = i.trip_id AND t.user_id = i.user_id
     WHERE t.user_id = $1 AND t.id = $2 AND t.status = 'active' AND i.product_id = $3`,
    [userId, trip.id, productId]
  )
  return existing.rows[0] ? { item: item(existing.rows[0]), created: false } : null
}

export async function updateItem(pool, userId, itemId, changes) {
  const fields = []
  const values = [userId, itemId]
  for (const [key, column] of [['name', 'name'], ['quantity', 'quantity'], ['unitLabel', 'unit_label']]) {
    if (Object.hasOwn(changes, key)) {
      values.push(changes[key])
      fields.push(`${column} = $${values.length}`)
    }
  }
  const result = await pool.query(
    `UPDATE cartcheck.trip_items i SET ${fields.join(', ')}, updated_at = now()
     WHERE i.user_id = $1 AND i.id = $2
       AND EXISTS (SELECT 1 FROM cartcheck.shopping_trips t
                   WHERE t.id = i.trip_id AND t.user_id = $1 AND t.status = 'active')
     RETURNING i.id, i.product_id, i.name, i.category, i.quantity, i.unit_label`,
    values
  )
  return result.rows[0] ? item(result.rows[0]) : null
}

export async function deleteItem(pool, userId, itemId) {
  const result = await pool.query(
    `DELETE FROM cartcheck.trip_items i
     WHERE i.user_id = $1 AND i.id = $2
       AND EXISTS (SELECT 1 FROM cartcheck.shopping_trips t
                   WHERE t.id = i.trip_id AND t.user_id = $1 AND t.status = 'active')
     RETURNING i.id`,
    [userId, itemId]
  )
  return result.rowCount > 0
}
