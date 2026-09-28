import test from 'node:test'
import assert from 'node:assert/strict'
import { getShoppingProgress } from './shoppingProgress.js'

test('empty list has zero remaining and purchased items', () => {
  assert.deepEqual(getShoppingProgress([]), {
    remainingCount: 0,
    purchasedCount: 0,
    visibleItems: [],
  })
})

test('mixed list derives counts from bought state', () => {
  const items = [{ id: 'a', bought: false }, { id: 'b', bought: true }, { id: 'c' }]
  const progress = getShoppingProgress(items)
  assert.equal(progress.remainingCount, 2)
  assert.equal(progress.purchasedCount, 1)
  assert.deepEqual(progress.visibleItems, items)
})

test('multiple purchased items are counted independently', () => {
  const items = [{ id: 'a', bought: true }, { id: 'b', bought: true }, { id: 'c', bought: false }]
  const progress = getShoppingProgress(items)
  assert.equal(progress.remainingCount, 1)
  assert.equal(progress.purchasedCount, 2)
})

test('all purchased list has no remaining items', () => {
  const items = [{ id: 'a', bought: true }, { id: 'b', bought: true }]
  const progress = getShoppingProgress(items)
  assert.equal(progress.remainingCount, 0)
  assert.equal(progress.purchasedCount, 2)
})

test('hiding all purchased items produces no visible results', () => {
  const items = [{ id: 'a', bought: true }, { id: 'b', bought: true }]
  assert.deepEqual(getShoppingProgress(items, true).visibleItems, [])
})

test('hide purchased filters the view without changing source items', () => {
  const items = [{ id: 'a', bought: true }, { id: 'b', bought: false }]
  const visible = getShoppingProgress(items, true)
  assert.deepEqual(visible.visibleItems, [items[1]])
  assert.equal(visible.remainingCount, 1)
  assert.equal(visible.purchasedCount, 1)
  assert.deepEqual(items, [{ id: 'a', bought: true }, { id: 'b', bought: false }])
  assert.deepEqual(getShoppingProgress(items, true).visibleItems, [items[1]])
})
