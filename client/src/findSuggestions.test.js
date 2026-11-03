import test from 'node:test'
import assert from 'node:assert/strict'
import { isItemList, lastTripProductIds, matchTier, parseItemList, rankSuggestions, resolveItemList } from './findSuggestions.js'

const products = (...names) => names.map((name, index) => ({ id: index + 1, name }))
const ranked = (names, term, lastTrip = []) => {
  const items = products(...names)
  const boughtBefore = new Set(items.filter((item) => lastTrip.includes(item.name)).map((item) => String(item.id)))
  return rankSuggestions(items, term, boughtBefore).map((item) => item.name)
}

test('an exact name comes before names that only contain the term', () => {
  assert.deepEqual(ranked(['Dinorado rice', 'Rice'], 'rice'), ['Rice', 'Dinorado rice'])
})

test('a simple plural counts as the exact name', () => {
  assert.deepEqual(ranked(['Banana chips', 'Bananas'], 'banana'), ['Bananas', 'Banana chips'])
  assert.deepEqual(ranked(['Tomato sauce', 'Tomatoes'], 'tomato'), ['Tomatoes', 'Tomato sauce'])
})

test('tiers run exact, name start, word start, then substring', () => {
  assert.deepEqual(ranked(['Licorice', 'Dinorado rice', 'Rice cakes', 'Rice'], 'rice'), ['Rice', 'Rice cakes', 'Dinorado rice', 'Licorice'])
})

test('a word start is found after an earlier mid-word match and after punctuation', () => {
  assert.deepEqual(ranked(['Apricot jam', 'Pure-rice flour'], 'ric'), ['Pure-rice flour', 'Apricot jam'])
  assert.deepEqual(ranked(['Brine rice', 'Abrine'], 'ri'), ['Brine rice', 'Abrine'])
})

test('a term of several words can start at any word', () => {
  assert.deepEqual(ranked(['Abrown rice', 'Long brown rice'], 'brown ri'), ['Long brown rice', 'Abrown rice'])
})

test('the last trip breaks ties inside a tier but never crosses tiers', () => {
  assert.deepEqual(ranked(['Almond milk', 'Fresh milk'], 'milk', ['Fresh milk']), ['Fresh milk', 'Almond milk'])
  assert.deepEqual(ranked(['Dinorado rice', 'Rice'], 'rice', ['Dinorado rice']), ['Rice', 'Dinorado rice'])
})

test('remaining ties sort A to Z', () => {
  assert.deepEqual(ranked(['Sinandomeng rice', 'Dinorado rice'], 'rice'), ['Dinorado rice', 'Sinandomeng rice'])
})

test('matching ignores case and surrounding spaces, and drops non-matches', () => {
  assert.deepEqual(ranked(['RICE', 'Eggs'], '  rIcE '), ['RICE'])
})

test('a blank term suggests nothing and the input stays unsorted', () => {
  const items = Object.freeze(products('Rice cakes', 'Rice'))
  assert.deepEqual(rankSuggestions(items, '   '), [])
  assert.deepEqual(rankSuggestions(items, 'rice').map((item) => item.name), ['Rice', 'Rice cakes'])
  assert.deepEqual(items.map((item) => item.name), ['Rice cakes', 'Rice'])
})

test('matchTier names exact, name start, word start, substring and no match', () => {
  assert.equal(matchTier('Rice', ' rICE '), 0)
  assert.equal(matchTier('Bananas', 'banana'), 0)
  assert.equal(matchTier('Tomatoes', 'tomato'), 0)
  assert.equal(matchTier('Rice cakes', 'rice'), 1)
  assert.equal(matchTier('Dinorado rice', 'rice'), 2)
  assert.equal(matchTier('Shampoo', 'ham'), 3)
  assert.equal(matchTier('Orange juice', 'ice'), 3)
  assert.equal(matchTier('Eggs', 'milk'), -1)
})

test('parseItemList splits on commas and lines, trims, and drops blanks and repeats', () => {
  assert.deepEqual(parseItemList(' eggs, Milk\nrice,,eggs , '), ['eggs', 'Milk', 'rice'])
})

test('isItemList needs a separator', () => {
  assert.equal(isItemList('eggs'), false)
  assert.equal(isItemList('eggs,'), true)
})

test('resolveItemList reuses only exact or plural matches and creates the rest', () => {
  const products = [{ id: 1, name: 'Bananas' }, { id: 2, name: 'Hamburger buns' }, { id: 3, name: 'Rice' }]
  assert.deepEqual(resolveItemList(['banana', 'ham', 'rice'], products, new Set(['3'])), {
    entries: [{ name: 'Bananas', product: products[0] }, { name: 'ham', product: null }],
    skipped: ['rice'],
  })
})

test('resolveItemList collapses plurals and skips names already being added', () => {
  const products = [{ id: 1, name: 'Bananas' }]
  assert.deepEqual(resolveItemList(['banana', 'bananas', 'apple', 'apples', 'soap'], products, new Set(), ['Soap']), {
    entries: [{ name: 'Bananas', product: products[0] }, { name: 'apple', product: null }],
    skipped: ['soap'],
  })
})

test('last trip items match the catalog by name because snapshots keep no product id', () => {
  const catalog = products('Almond milk', 'Fresh milk', 'Eggs')
  const tripItems = [{ productId: null, name: 'fresh MILK', bought: false }, { productId: null, name: 'Deleted item', bought: true }]
  const ids = lastTripProductIds(catalog, tripItems)
  assert.deepEqual([...ids], ['2'])
  assert.deepEqual(rankSuggestions(catalog, 'milk', ids).map((item) => item.name), ['Fresh milk', 'Almond milk'])
  assert.deepEqual([...lastTripProductIds(catalog)], [])
})
