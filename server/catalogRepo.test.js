import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { deleteCatalogItem, updateCatalogItem } from './catalogRepo.js'

const here = (name) => fileURLToPath(new URL(name, import.meta.url))

test('starter copies can be edited in place only by their owner and remain protected from deletion', async () => {
  const row = { id: 42, name: 'My apples', category: 'Produce', source_starter_code: 'produce-apples' }
  const queries = []
  const pool = {
    async query(sql, values) {
      queries.push({ sql, values })
      if (sql.startsWith('UPDATE')) return values[0] === 'owner-a' ? { rows: [row] } : { rows: [] }
      return { rowCount: 0, rows: [] }
    },
  }

  const edited = await updateCatalogItem(pool, 'owner-a', '42', { name: 'My apples' })
  assert.deepEqual(edited, { id: '42', name: 'My apples', category: 'Produce', source: 'starter' })
  assert.match(queries[0].sql, /WHERE user_id = \$1 AND id = \$2\s+RETURNING/)
  assert.doesNotMatch(queries[0].sql, /source_starter_code IS NULL/)
  assert.deepEqual(queries[0].values, ['owner-a', '42', 'My apples'])

  assert.equal(await updateCatalogItem(pool, 'owner-b', '42', { name: 'Stolen' }), null)
  assert.deepEqual(queries[1].values, ['owner-b', '42', 'Stolen'])
  assert.equal(await deleteCatalogItem(pool, 'owner-a', '42'), false)
  assert.match(queries[2].sql, /source_starter_code IS NULL/)
})

test('seed adds 52 unique templates, preserves all original labels, and is rerun-safe', async () => {
  const seed = await readFile(here('./db/seed.sql'), 'utf8')
  const backfill = await readFile(here('./db/backfill-starters.sql'), 'utf8')
  const rows = [...seed.matchAll(/\('([^']+)', '([^']+)', '([^']+)'\)/g)].map((match) => match.slice(1, 4))
  const codes = rows.map(([code]) => code)
  assert.equal(rows.length, 160)
  assert.equal(new Set(codes).size, 160, 'starter codes must be unique')
  assert.equal(new Set(rows.map(([, name]) => name.toLocaleLowerCase())).size, 160, 'starter labels must not duplicate')

  const originalHash = createHash('sha256')
    .update(rows.slice(0, 108).map((row) => row.join('|')).join('\n'))
    .digest('hex')
  assert.equal(originalHash, 'ef2df64303522bae93f4480e60f3fa748aaa73d54973a7b571d562b6b1b7673f',
    'the original 108 code/name/category rows must stay unchanged')

  const addedCodes = codes.slice(108)
  assert.equal(addedCodes.length, 52)
  assert.equal(addedCodes.filter((code) => codes.slice(0, 108).includes(code)).length, 0,
    'new starter codes must not overlap existing templates')
  const backfillCodes = [...backfill.matchAll(/'([a-z]+-[a-z-]+)'/g)].map((match) => match[1])
  assert.deepEqual(new Set(backfillCodes), new Set(addedCodes), 'existing-user backfill must match precisely the new codes')
  const addedCategoryCounts = rows.slice(108).reduce((counts, [, , category]) => {
    counts[category] = (counts[category] ?? 0) + 1
    return counts
  }, {})
  assert.deepEqual(addedCategoryCounts, {
    Produce: 10,
    'Dairy & eggs': 1,
    'Meat & seafood': 11,
    Pantry: 15,
    Beverages: 4,
    Household: 9,
    Frozen: 1,
    Snacks: 1,
  })
  const addedByCode = new Map(rows.slice(108).map(([code, name, category]) => [code, { name, category }]))
  for (const [code, name, category] of [
    ['produce-ampalaya', 'Ampalaya', 'Produce'], ['produce-upo', 'Upo', 'Produce'],
    ['meat-chicken-thigh', 'Chicken thigh', 'Meat & seafood'],
    ['meat-chicken-drumstick', 'Chicken drumstick', 'Meat & seafood'],
    ['meat-whole-chicken', 'Whole chicken', 'Meat & seafood'],
    ['seafood-galunggong', 'Galunggong', 'Meat & seafood'],
    ['produce-saba-bananas', 'Saba banana', 'Produce'],
    ['produce-lakatan-bananas', 'Lakatan banana', 'Produce'],
    ['pantry-pancit-canton', 'Pancit canton', 'Pantry'],
    ['pantry-regular-milled-rice', 'Regular milled rice', 'Pantry'],
    ['pantry-dinorado-rice', 'Dinorado rice', 'Pantry'],
    ['pantry-sinandomeng-rice', 'Sinandomeng rice', 'Pantry'],
    ['pantry-glutinous-rice', 'Glutinous rice (malagkit)', 'Pantry'],
    ['pantry-corn-grits', 'Corn grits', 'Pantry'],
    ['pantry-banana-ketchup', 'Banana ketchup', 'Pantry'],
    ['pantry-coconut-cream', 'Coconut cream', 'Pantry'],
    ['beverages-instant-coffee', 'Instant coffee', 'Beverages'],
    ['beverages-three-in-one-coffee', '3-in-1 coffee', 'Beverages'],
    ['pantry-cup-noodles', 'Cup noodles', 'Pantry'],
    ['household-fabric-conditioner', 'Fabric conditioner', 'Household'],
    ['household-toothbrush', 'Toothbrush', 'Household'],
    ['household-sanitary-pads', 'Sanitary pads', 'Household'],
    ['household-hair-conditioner', 'Hair conditioner', 'Household'],
    ['meat-pork-shoulder-kasim', 'Pork shoulder (kasim)', 'Meat & seafood'],
    ['meat-pork-belly', 'Pork belly (liempo)', 'Meat & seafood'],
  ]) assert.deepEqual(addedByCode.get(code), { name, category }, `expected revised staple ${code}`)
  assert.match(seed, /ON CONFLICT \(code\) DO NOTHING\s*;/)
  assert.match(backfill, /ON CONFLICT \(user_id, source_starter_code\) DO NOTHING\s*;/)

  // Model the specified DO NOTHING conflict behavior, including a prior user
  // customization and applying the same seed again.
  const effective = new Map(rows.slice(0, 108).map(([code, name, category]) => [code, { name, category }]))
  effective.set('produce-apples', { name: 'My apples', category: 'Other' })
  for (const [code, name, category] of rows) if (!effective.has(code)) effective.set(code, { name, category })
  const firstRun = JSON.stringify([...effective])
  for (const [code, name, category] of rows) if (!effective.has(code)) effective.set(code, { name, category })
  assert.equal(JSON.stringify([...effective]), firstRun, 'rerunning the seed leaves existing rows untouched')
  assert.deepEqual(effective.get('produce-apples'), { name: 'My apples', category: 'Other' })
  assert.equal(effective.size, 160)
})
