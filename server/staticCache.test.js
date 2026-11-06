import assert from 'node:assert/strict'
import test from 'node:test'
import { join } from 'node:path'
import { setStaticCacheHeaders } from './staticCache.js'

function headersFor(filePath) {
  const headers = {}
  setStaticCacheHeaders({ setHeader: (name, value) => { headers[name] = value } }, filePath)
  return headers
}

test('hashed build assets are cached for a year and never revalidated', () => {
  assert.equal(headersFor(join('client', 'dist', 'assets', 'index-6x7MCJ8y.js'))['Cache-Control'], 'public, max-age=31536000, immutable')
})

test('index.html and other root files are always revalidated', () => {
  assert.equal(headersFor(join('client', 'dist', 'index.html'))['Cache-Control'], 'no-cache')
  assert.equal(headersFor(join('client', 'dist', 'favicon.svg'))['Cache-Control'], 'no-cache')
})
