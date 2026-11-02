import test from 'node:test'
import assert from 'node:assert/strict'
import { rankSuggestions } from './findSuggestions.js'

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
