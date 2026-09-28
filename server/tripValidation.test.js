import test from 'node:test'
import assert from 'node:assert/strict'
import { validateCorrection, validateHistoryQuery, validateRevision } from './tripValidation.js'

test('correction validation accepts standalone historical snapshots and normalizes values', () => {
  const result = validateCorrection({ revision: 4, items: [{
    name: '  Flour ', category: 'Pantry', quantity: 0.5, unitLabel: ' kg ',
    estimatedTotal: null, actualTotal: '0', bought: true,
  }] })
  assert.deepEqual(result, { revision: 4, items: [{
    id: null, productId: null, name: 'Flour', category: 'Pantry', quantity: '0.500', unitLabel: 'kg',
    estimatedTotal: null, actualTotal: '0.00', bought: true,
  }] })
})

test('correction validation rejects malformed and duplicate historical IDs', () => {
  assert.match(validateCorrection({ revision: 0, items: [] }).error, /revision/i)
  assert.match(validateCorrection({ revision: 1, items: [{
    id: '8', name: 'A', category: 'Pantry', quantity: 1, bought: false,
  }, {
    id: '8', name: 'B', category: 'Pantry', quantity: 1, bought: false,
  }] }).error, /unique/i)
})

test('history pagination is bounded and validates opaque cursors', () => {
  assert.deepEqual(validateHistoryQuery({ limit: '100' }), { limit: 100, cursor: null })
  assert.ok(validateHistoryQuery({ limit: '0' }).error)
  assert.ok(validateHistoryQuery({ cursor: 'invalid' }).error)
  const cursor = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  assert.ok(validateHistoryQuery({ cursor: cursor({ completedAt: 'not-a-date', id: '1' }) }).error)
  assert.ok(validateHistoryQuery({ cursor: cursor({ completedAt: '2026-02-30T00:00:00.000Z', id: '1' }) }).error)
  assert.ok(validateHistoryQuery({ cursor: cursor({ completedAt: '2026-09-28T00:00:00.000Z', id: '9223372036854775808' }) }).error)
  assert.deepEqual(validateHistoryQuery({ cursor: cursor({ completedAt: '2026-09-28T00:00:00.000Z', id: '7' }) }),
    { limit: 20, cursor: { completedAt: '2026-09-28T00:00:00.000Z', id: '7' } })
  assert.deepEqual(validateRevision(3), { revision: 3 })
  assert.ok(validateRevision('3').error)
})
