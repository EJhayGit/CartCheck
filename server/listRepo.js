function mapItem(row) {
  return { id: String(row.id), productId: row.product_id === null ? null : String(row.product_id),
    name: row.name, category: row.category, quantity: row.quantity, unitLabel: row.unit_label,
    estimatedTotal: row.estimated_total, actualTotal: row.actual_total, bought: row.bought }
}

async function detail(queryable, userId, row) {
  const itemRows = await queryable.query(
    `SELECT id, product_id, name, category, quantity, unit_label, estimated_total, actual_total, bought
     FROM cartcheck.trip_items WHERE user_id = $1 AND trip_id = $2 ORDER BY created_at, id`, [userId, row.id])
  const totals = await queryable.query(
    `SELECT count(*)::int AS item_count, count(*) FILTER (WHERE bought)::int AS bought_count,
            count(*) FILTER (WHERE NOT bought)::int AS not_bought_count,
            sum(estimated_total) AS estimated_total,
            count(*) FILTER (WHERE estimated_total IS NULL)::int AS estimated_missing_count,
            sum(actual_total) FILTER (WHERE bought) AS actual_total,
            count(*) FILTER (WHERE bought AND actual_total IS NULL)::int AS actual_missing_count
     FROM cartcheck.trip_items WHERE user_id = $1 AND trip_id = $2`, [userId, row.id])
  const sum = totals.rows[0]
  return { tripId: String(row.id), name: row.name, status: row.status, currency: row.currency,
    budget: row.budget, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at,
    items: itemRows.rows.map(mapItem),
    summary: { itemCount: sum.item_count, boughtCount: sum.bought_count, notBoughtCount: sum.not_bought_count,
      estimatedTotal: sum.estimated_total, estimatedMissingCount: sum.estimated_missing_count,
      actualTotal: sum.actual_total, actualMissingCount: sum.actual_missing_count } }
}

const LIST_FIELDS = 'id, user_id, name, status, currency, budget, revision, created_at, updated_at'

async function selectDetail(queryable, userId, listId, { lock = false } = {}) {
  const result = await queryable.query(
    `SELECT ${LIST_FIELDS} FROM cartcheck.shopping_trips
     WHERE id = $1 AND user_id = $2 AND status = 'active'${lock ? ' FOR UPDATE' : ''}`,
    [listId, userId])
  return result.rows[0] ? detail(queryable, userId, result.rows[0]) : null
}

async function transaction(pool, callback) {
  const client = await pool.connect()
  try { await client.query('BEGIN'); const value = await callback(client); await client.query('COMMIT'); return value }
  catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error }
  finally { client.release() }
}

export async function createList(pool, userId, { name, budget, currency }) {
  return transaction(pool, async (client) => {
    const result = await client.query(
      `INSERT INTO cartcheck.shopping_trips (user_id, name, status, currency, budget)
       SELECT id, $2, 'active', COALESCE($4, preferred_currency), $3 FROM cartcheck.users WHERE id = $1
       RETURNING ${LIST_FIELDS}`, [userId, name, budget, currency ?? null])
    return result.rows[0] ? detail(client, userId, result.rows[0]) : null
  })
}

export async function listActiveLists(pool, userId, { limit, cursor }) {
  const result = await pool.query(
    `SELECT t.id, t.name, t.currency, t.budget, t.revision, t.created_at, t.updated_at,
            to_char(t.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_updated_at,
            count(i.id)::int AS item_count, count(i.id) FILTER (WHERE i.bought)::int AS bought_count,
            count(i.id) FILTER (WHERE NOT i.bought)::int AS not_bought_count,
            sum(i.estimated_total) AS estimated_total,
            count(i.id) FILTER (WHERE i.estimated_total IS NULL)::int AS estimated_missing_count,
            sum(i.actual_total) FILTER (WHERE i.bought) AS actual_total,
            count(i.id) FILTER (WHERE i.bought AND i.actual_total IS NULL)::int AS actual_missing_count
     FROM cartcheck.shopping_trips t LEFT JOIN cartcheck.trip_items i ON i.trip_id = t.id AND i.user_id = t.user_id
     WHERE t.user_id = $1 AND t.status = 'active'
       AND ($2::timestamptz IS NULL OR (t.updated_at, t.id) < ($2::timestamptz, $3::bigint))
     GROUP BY t.id ORDER BY t.updated_at DESC, t.id DESC LIMIT $4`,
    [userId, cursor?.updatedAt ?? null, cursor?.id ?? null, limit + 1])
  const hasMore = result.rows.length > limit
  const rows = result.rows.slice(0, limit)
  const items = rows.map((row) => ({ tripId: String(row.id), name: row.name, status: 'active',
    currency: row.currency, budget: row.budget, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at,
    summary: { itemCount: row.item_count, boughtCount: row.bought_count, notBoughtCount: row.not_bought_count,
      estimatedTotal: row.estimated_total, estimatedMissingCount: row.estimated_missing_count,
      actualTotal: row.actual_total, actualMissingCount: row.actual_missing_count } }))
  const last = rows.at(-1)
  return { items, nextCursor: hasMore && last
    ? Buffer.from(JSON.stringify({ updatedAt: last.cursor_updated_at, id: String(last.id) })).toString('base64url') : null }
}

export async function getActiveList(pool, userId, listId) {
  return transaction(pool, (client) => selectDetail(client, userId, listId, { lock: true }))
}

export async function updateList(pool, userId, listId, changes) {
  return transaction(pool, async (client) => {
    const locked = await client.query(`SELECT id FROM cartcheck.shopping_trips WHERE id=$1 AND user_id=$2 AND status='active' FOR UPDATE`, [listId, userId])
    if (!locked.rowCount) return null
    const fields = [], values = [listId, userId]
    for (const [key, column] of [['name', 'name'], ['budget', 'budget']]) if (Object.hasOwn(changes, key)) {
      values.push(changes[key]); fields.push(`${column} = $${values.length}`)
    }
    await client.query(`UPDATE cartcheck.shopping_trips SET ${fields.join(', ')}, revision=revision+1, updated_at=now()
      WHERE id=$1 AND user_id=$2 AND status='active'`, values)
    return selectDetail(client, userId, listId)
  })
}

export async function deleteList(pool, userId, listId) {
  return transaction(pool, async (client) => {
    const result = await client.query(`DELETE FROM cartcheck.shopping_trips WHERE id=$1 AND user_id=$2 AND status='active' RETURNING id`, [listId, userId])
    return result.rowCount > 0
  })
}

export async function addCatalogItem(pool, userId, listId, productId) {
  return transaction(pool, async (client) => {
    const locked = await client.query(`SELECT id FROM cartcheck.shopping_trips WHERE id=$1 AND user_id=$2 AND status='active' FOR UPDATE`, [listId, userId])
    if (!locked.rowCount) return null
    const inserted = await client.query(
      `INSERT INTO cartcheck.trip_items (user_id, trip_id, product_id, name, category, quantity)
       SELECT $1, $2, p.id, p.name, p.category, 1 FROM cartcheck.products p WHERE p.user_id=$1 AND p.id=$3
       ON CONFLICT (trip_id, product_id) DO NOTHING
       RETURNING id, product_id, name, category, quantity, unit_label, estimated_total, actual_total, bought`, [userId, listId, productId])
    let row = inserted.rows[0]
    const created = Boolean(row)
    if (!row) {
      const existing = await client.query(`SELECT id, product_id, name, category, quantity, unit_label, estimated_total, actual_total, bought
        FROM cartcheck.trip_items WHERE user_id=$1 AND trip_id=$2 AND product_id=$3`, [userId, listId, productId])
      row = existing.rows[0]
      if (!row) return null
    } else await client.query(`UPDATE cartcheck.shopping_trips SET revision=revision+1, updated_at=now() WHERE id=$1 AND user_id=$2`, [listId, userId])
    return { item: mapItem(row), created, list: await selectDetail(client, userId, listId) }
  })
}

export async function updateListItem(pool, userId, listId, itemId, changes) {
  return transaction(pool, async (client) => {
    const locked = await client.query(`SELECT id FROM cartcheck.shopping_trips
      WHERE id=$1 AND user_id=$2 AND status='active' FOR UPDATE`, [listId, userId])
    if (!locked.rowCount) return null
    const fields = [], values = [userId, listId, itemId]
    for (const [key, column] of [['name', 'name'], ['quantity', 'quantity'], ['unitLabel', 'unit_label'],
      ['estimatedTotal', 'estimated_total'], ['actualTotal', 'actual_total'], ['bought', 'bought']]) if (Object.hasOwn(changes, key)) {
      values.push(changes[key]); fields.push(`${column}=$${values.length}`)
    }
    const updated = await client.query(`UPDATE cartcheck.trip_items SET ${fields.join(', ')}, updated_at=now()
      WHERE user_id=$1 AND trip_id=$2 AND id=$3 RETURNING id, product_id, name, category, quantity, unit_label, estimated_total, actual_total, bought`, values)
    if (!updated.rowCount) return null
    await client.query(`UPDATE cartcheck.shopping_trips SET revision=revision+1, updated_at=now() WHERE id=$1 AND user_id=$2`, [listId, userId])
    return { item: mapItem(updated.rows[0]), list: await selectDetail(client, userId, listId) }
  })
}

export async function deleteListItem(pool, userId, listId, itemId) {
  return transaction(pool, async (client) => {
    const locked = await client.query(`SELECT t.id FROM cartcheck.shopping_trips t JOIN cartcheck.trip_items i ON i.trip_id=t.id AND i.user_id=t.user_id
      WHERE t.id=$1 AND t.user_id=$2 AND i.id=$3 AND t.status='active' FOR UPDATE OF t`, [listId, userId, itemId])
    if (!locked.rowCount) return null
    const deleted = await client.query(`DELETE FROM cartcheck.trip_items WHERE user_id=$1 AND trip_id=$2 AND id=$3`, [userId, listId, itemId])
    if (!deleted.rowCount) return null
    await client.query(`UPDATE cartcheck.shopping_trips SET revision=revision+1, updated_at=now() WHERE id=$1 AND user_id=$2`, [listId, userId])
    return { list: await selectDetail(client, userId, listId) }
  })
}
