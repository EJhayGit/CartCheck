import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeListName, validateListChanges, validateListCreate, validateListQuery } from './listValidation.js'

test('list names trim Unicode whitespace and count Unicode code points', () => {
  assert.equal(normalizeListName('\u00a0\u2003Market run\ufeff'), 'Market run')
  assert.equal(normalizeListName('😀'.repeat(100)), '😀'.repeat(100))
  assert.equal(normalizeListName('😀'.repeat(101)), null)
  assert.equal(normalizeListName('\u00a0\u2003\ufeff'), null)
  assert.equal(normalizeListName(` ${'x'.repeat(100)} `), 'x'.repeat(100))
})

test('list create and patch validate only supported fields and preserve zero budgets', () => {
  assert.deepEqual(validateListCreate({ name: ' Weekend ', budget: '0', currency: 'PHP' }),
    { name: 'Weekend', budget: '0.00', currency: 'PHP' })
  assert.deepEqual(validateListCreate({ name: 'Pantry' }), { name: 'Pantry', budget: null, currency: undefined })
  assert.deepEqual(validateListChanges({ name: ' Pantry ', budget: null }), { name: 'Pantry', budget: null })
  for (const body of [{}, { name: '  ' }, { name: 'x'.repeat(101) }, { name: 'valid', currency: 'GBP' },
    { name: 'valid', unexpected: true }, { budget: 4 }]) assert.ok(validateListCreate(body).error)
  assert.ok(validateListChanges({ currency: 'USD' }).error)
})

test('active-list pagination cursor is bounded and strictly parsed', () => {
  assert.deepEqual(validateListQuery({}), { limit: 50, cursor: null })
  const cursor = Buffer.from(JSON.stringify({ updatedAt: '2026-10-05T00:00:00.000Z', id: '19' })).toString('base64url')
  assert.deepEqual(validateListQuery({ limit: '3', cursor }),
    { limit: 3, cursor: { updatedAt: '2026-10-05T00:00:00.000Z', id: '19' } })
  assert.ok(validateListQuery({ limit: '101' }).error)
  assert.ok(validateListQuery({ cursor: 'not-a-cursor' }).error)
})
