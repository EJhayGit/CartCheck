import test from 'node:test'
import assert from 'node:assert/strict'
import { getShoppingProgress, sortShoppingItems } from './shoppingProgress.js'

test('all sorts preserve stored order, stable ties, and work after purchased filtering', () => {
  const items = Object.freeze([
    { id: 1, name: 'Rice', category: 'Pantry', bought: true },
    { id: 2, name: 'Milk', category: 'Dairy', bought: false },
    { id: 3, name: 'Apples', category: 'Produce', bought: false },
    { id: 4, name: 'Eggs', category: 'Dairy', bought: true },
  ])
  const ids = (mode, entries = items) => sortShoppingItems(entries, mode).map((item) => item.id)
  assert.deepEqual(ids('default'), [1, 2, 3, 4])
  assert.deepEqual(ids('az'), [3, 4, 2, 1])
  assert.deepEqual(ids('category'), [4, 2, 1, 3])
  assert.deepEqual(ids('unpurchased'), [2, 3, 1, 4])
  assert.deepEqual(ids('purchased'), [1, 4, 2, 3])
  assert.deepEqual(ids('az', getShoppingProgress(items, true).visibleItems), [3, 2])
  assert.deepEqual(items.map((item) => item.id), [1, 2, 3, 4])
  for (const mode of ['default', 'az', 'category', 'unpurchased', 'purchased']) {
    assert.deepEqual(sortShoppingItems([], mode), [])
    assert.deepEqual(sortShoppingItems(items.slice(0, 1), mode), items.slice(0, 1))
  }
  assert.deepEqual(ids('purchased', items.map((item) => ({ ...item, bought: item.id === 3 }))), [3, 1, 2, 4])
})
