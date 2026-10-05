// Fixture-only browser review preparation, independent of all configured DBs.
import pg from 'pg'
import { readFile, writeFile } from 'node:fs/promises'
import { createSessionToken, SESSION_COOKIE } from '../authSecurity.js'
import { createList, addCatalogItem, updateListItem } from '../listRepo.js'
import { finishTrip } from '../tripRepo.js'
const target = JSON.parse(await readFile(new URL('../.test-runs/local-target.json', import.meta.url), 'utf8'))
if (target.host !== '127.0.0.1' || target.port !== 55439 || target.previewDatabase !== 'cartcheck_lists_preview') throw new Error('Not the isolated preview cluster')
const pool = new pg.Pool({ connectionString: 'postgresql://postgres:local-fixture-only@127.0.0.1:55439/cartcheck_lists_preview', ssl: false })
try {
  if (!(await pool.query("SELECT to_regclass('cartcheck.shopping_trips') AS table_name")).rows[0].table_name) {
    for (const filename of ['001_initial.sql', '002_nullable_historical_product.sql', '003_account_enhancements.sql', '004_multiple_named_lists.sql']) {
      const client = await pool.connect()
      try { await client.query('BEGIN'); await client.query(await readFile(new URL('./migrations/' + filename, import.meta.url), 'utf8')); await client.query('COMMIT') }
      catch (e) { await client.query('ROLLBACK'); throw e } finally { client.release() }
    }
    await pool.query(await readFile(new URL('./seed.sql', import.meta.url), 'utf8'))
  }
  const user = (await pool.query(`INSERT INTO cartcheck.users(email,password_hash,email_verified) VALUES ('lists-preview@example.invalid','local-fixture-unusable',true)
    ON CONFLICT(email) DO UPDATE SET email_verified=true RETURNING id`)).rows[0].id
  await pool.query('DELETE FROM cartcheck.trip_items WHERE user_id=$1', [user])
  await pool.query('DELETE FROM cartcheck.shopping_trips WHERE user_id=$1', [user])
  await pool.query(`INSERT INTO cartcheck.products(user_id,source_starter_code,name,category)
    SELECT $1,code,name,category FROM cartcheck.starter_products ON CONFLICT(user_id,source_starter_code) DO NOTHING`, [user])
  const products = (await pool.query('SELECT id,name FROM cartcheck.products WHERE user_id=$1 ORDER BY id', [user])).rows
  const make = async (name, budget, names, boughtCount) => {
    let list = await createList(pool, user, { name, budget, currency: 'PHP' })
    for (const [index, itemName] of names.entries()) {
      const added = await addCatalogItem(pool, user, list.tripId, products.find((p) => p.name === itemName).id)
      list = (await updateListItem(pool, user, list.tripId, added.item.id, {
        quantity: index === 1 ? '2.000' : '1.000', unitLabel: index === 1 ? 'kg' : 'pack',
        bought: index < boughtCount, estimatedTotal: index === names.length - 1 ? null : '100.00',
        actualTotal: index < boughtCount - 1 ? '95.00' : null,
      })).list
    }
    return list
  }
  const weekly = await make('Weekly Groceries', '2000.00', ['Milk','Rice','Eggs','Chicken','White bread','Apples','Bananas','Soy sauce','Vinegar','Cooking oil','Pechay','Pancit canton','Carrots','Tomatoes'], 8)
  const party = await make('Party Supplies', null, ['Potato chips','Bottled water','Crackers','Biscuits','Orange juice'], 2)
  const mom = await make("Mom’s Grocery List", '1500.00', ['Coffee','Milk','Eggs'], 1)
  const past = await make('Weekend Market', '1800.00', ['Rice','Chicken','Apples','Eggs'], 3)
  await finishTrip(pool, user, past.tripId, past.revision)
  const session = createSessionToken()
  await pool.query('INSERT INTO cartcheck.sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval \'1 day\')', [user, session.tokenHash])
  const emptyUser = (await pool.query(`INSERT INTO cartcheck.users(email,password_hash,email_verified) VALUES('empty-preview@example.invalid','local-fixture-unusable',true)
    ON CONFLICT(email) DO UPDATE SET email_verified=true RETURNING id`)).rows[0].id
  const emptySession = createSessionToken()
  await pool.query('INSERT INTO cartcheck.sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval \'1 day\')', [emptyUser, emptySession.tokenHash])
  await writeFile(new URL('../.test-runs/preview-session.json', import.meta.url), JSON.stringify({ cookie: { name: SESSION_COOKIE, value: session.token }, emptyCookie: { name: SESSION_COOKIE, value: emptySession.token }, lists: { weekly: weekly.tripId, party: party.tripId, mom: mom.tripId }, completedId: past.tripId, userId: String(user) }))
  console.log('Local browser fixtures ready: 3 active named lists + 1 completed trip; no emails or external requests')
} finally { await pool.end() }
