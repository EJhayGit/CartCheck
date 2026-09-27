function catalogItem(row) {
  return {
    id: String(row.id),
    name: row.name,
    category: row.category,
    source: row.source_starter_code === null ? 'custom' : 'starter',
  }
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, '\\$&')
}

export async function listCatalog(pool, userId, { search, category }) {
  const params = [userId]
  const predicates = ['user_id = $1']
  if (search) {
    params.push(`%${escapeLike(search)}%`)
    predicates.push(`name ILIKE $${params.length} ESCAPE E'\\\\'`)
  }
  if (category) {
    params.push(category)
    predicates.push(`category = $${params.length}`)
  }

  const result = await pool.query(
    `SELECT id, name, category, source_starter_code
     FROM cartcheck.products
     WHERE ${predicates.join(' AND ')}
     ORDER BY lower(name), id`,
    params
  )
  return result.rows.map(catalogItem)
}

export async function createCatalogItem(pool, userId, { name, category }) {
  const result = await pool.query(
    `INSERT INTO cartcheck.products (user_id, name, category)
     VALUES ($1, $2, $3)
     RETURNING id, name, category, source_starter_code`,
    [userId, name, category]
  )
  return catalogItem(result.rows[0])
}

export async function updateCatalogItem(pool, userId, id, changes) {
  const fields = []
  const values = [userId, id]
  if (Object.hasOwn(changes, 'name')) {
    values.push(changes.name)
    fields.push(`name = $${values.length}`)
  }
  if (Object.hasOwn(changes, 'category')) {
    values.push(changes.category)
    fields.push(`category = $${values.length}`)
  }
  fields.push('updated_at = now()')

  const result = await pool.query(
    `UPDATE cartcheck.products
     SET ${fields.join(', ')}
     WHERE user_id = $1 AND id = $2 AND source_starter_code IS NULL
     RETURNING id, name, category, source_starter_code`,
    values
  )
  return result.rows[0] ? catalogItem(result.rows[0]) : null
}

export async function deleteCatalogItem(pool, userId, id) {
  const result = await pool.query(
    `DELETE FROM cartcheck.products
     WHERE user_id = $1 AND id = $2 AND source_starter_code IS NULL
     RETURNING id`,
    [userId, id]
  )
  return result.rowCount > 0
}
